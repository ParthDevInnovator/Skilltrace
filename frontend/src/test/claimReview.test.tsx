import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/services/api'
import { ClaimReviewCard } from '@/components/profile/ClaimReviewCard'
import type { ResumeClaim } from '@/types/context'
import { exampleContext } from './evidenceFixtures'

vi.mock('@/services/api', () => ({ api: { reviewClaim: vi.fn(), clearClaimReview: vi.fn() } }))

// OI-29: automatic links are suggestions; only a recruiter's confirmation verifies.
const record = { ...exampleContext.evidence_records[0], id: 'OBS-GH', source_type: 'github' as const, source_url: 'https://github.com/alex/payments', observation: 'Public repository alex/payments lists Python', provenance: 'live' }
const context = { ...exampleContext, evidence_records: [record] }
const linked: ResumeClaim = { ...exampleContext.claims[0], evidence_link: 'supported_by_evidence', supporting_evidence_ids: ['OBS-GH'],
  conflicting_evidence_ids: [], assessment_reason: '1 public observation mentions Python.' }

describe('ClaimReviewCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the suggested link with its evidence and stays unverified until confirmed', async () => {
    const onUpdated = vi.fn()
    const confirmed = { ...linked, verification_state: 'supported' as const,
      review: { decision: 'confirmed' as const, reviewed_link: 'supported_by_evidence' as const, reviewed_by: 'Rita', reviewed_at: '2026-11-27T00:00:00Z' } }
    vi.mocked(api.reviewClaim).mockResolvedValue(confirmed)
    render(<ClaimReviewCard claim={linked} context={context} canReview onUpdated={onUpdated} />)
    expect(screen.getByText('Supported by evidence')).toBeVisible()
    expect(screen.getByText('Public repository alex/payments lists Python')).toBeVisible()
    expect(screen.getByText('Unverified until a recruiter confirms it.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm link' }))
    expect(api.reviewClaim).toHaveBeenCalledWith('CAND-001', 'CLAIM-1', 'confirmed')
    expect(onUpdated).toHaveBeenCalledWith(confirmed)
  })

  it('offers confirm contradiction / dismiss for a possible contradiction, and undo once reviewed', async () => {
    const flagged: ResumeClaim = { ...linked, evidence_link: 'possible_contradiction', supporting_evidence_ids: [], conflicting_evidence_ids: ['OBS-GH'] }
    const { rerender } = render(<ClaimReviewCard claim={flagged} context={context} canReview onUpdated={vi.fn()} />)
    expect(screen.getByText('May conflict')).toBeVisible()
    vi.mocked(api.reviewClaim).mockResolvedValue(flagged)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(api.reviewClaim).toHaveBeenCalledWith('CAND-001', 'CLAIM-1', 'dismissed')
    expect(screen.getByRole('button', { name: 'Confirm contradiction' })).toBeVisible()

    const dismissed = { ...flagged, review: { decision: 'dismissed' as const, reviewed_link: 'possible_contradiction' as const, reviewed_by: 'Rita', reviewed_at: '2026-11-27T00:00:00Z' } }
    vi.mocked(api.clearClaimReview).mockResolvedValue(flagged)
    rerender(<ClaimReviewCard claim={dismissed} context={context} canReview onUpdated={vi.fn()} />)
    expect(screen.getByText(/Dismissed by Rita/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Undo review' }))
    expect(api.clearClaimReview).toHaveBeenCalledWith('CAND-001', 'CLAIM-1')
  })

  it('cannot review claims without a link, or without permission, and reports save failures', async () => {
    const none: ResumeClaim = { ...linked, evidence_link: 'no_evidence', supporting_evidence_ids: [] }
    const { rerender } = render(<ClaimReviewCard claim={none} context={context} canReview onUpdated={vi.fn()} />)
    expect(screen.getByText('No public evidence')).toBeVisible()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(<ClaimReviewCard claim={linked} context={context} canReview={false} onUpdated={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(<ClaimReviewCard claim={{ ...linked, evidence_link: undefined }} context={context} canReview onUpdated={vi.fn()} />)
    expect(screen.getByText('Not assessed')).toBeVisible()

    vi.mocked(api.reviewClaim).mockRejectedValue(new Error('down'))
    rerender(<ClaimReviewCard claim={linked} context={context} canReview onUpdated={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
  })
})
