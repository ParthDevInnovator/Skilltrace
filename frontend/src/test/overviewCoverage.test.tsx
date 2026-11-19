import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/services/api'
import { IntelligenceOverview, matchCoverage } from '@/components/profile/IntelligenceOverview'
import { exampleContext } from './evidenceFixtures'
import type { CandidateMatchResult, CoverageState, ExtractedRequirement } from '@/types/matching'
import type { Job } from '@/types/job'

vi.mock('@/services/api', () => ({ api: { getCandidateJdMatch: vi.fn(), extractRequirements: vi.fn() } }))

// OI-10: Overview coverage is the backend match, not a client-side substring check.
const requirement = (id: string, text: string, is_mandatory: boolean): ExtractedRequirement =>
  ({ id, requirement_text: text, normalized_text: text.toLowerCase(), category: 'Backend', is_mandatory, skill_aliases: [] })
const requirements = [requirement('J-REQ-001', 'Python', true), requirement('J-REQ-002', 'Kafka', true), requirement('J-REQ-003', 'Go', false)]
const row = (requirement_id: string, coverage_state: CoverageState) =>
  ({ requirement_id, coverage_state, claim_ids: [], evidence_record_ids: [], coverage_weight: 1, evidence_strength: 0, observation: '' })
const match: CandidateMatchResult = { candidate_id: exampleContext.candidate.id, job_id: 'J', reference_date: '2026-11-19',
  resume_fit: .5, evidence_strength: .5, final_score: .5, result_built_at: '2026-11-19T00:00:00Z',
  coverage: [row('J-REQ-001', 'insufficient_evidence'), row('J-REQ-002', 'matched'), row('J-REQ-003', 'partially_supported')] }
const job = { id: 'J', title: 'Role', requirements } as unknown as Job

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.extractRequirements).mockResolvedValue(requirements)
})

describe('matchCoverage', () => {
  it('counts matched requirements per mandatory group and notes partial support', () => {
    expect(matchCoverage(match, requirements, true)).toEqual({ label: '1/2', percent: 50 })
    expect(matchCoverage(match, requirements, false)).toEqual({ label: '0/1 · 1 partial', percent: 0 })
  })
  it('never invents coverage while loading, building or failed', () => {
    expect(matchCoverage(null, requirements, true).label).toBe('Assessing…')
    expect(matchCoverage({ status: 'building' }, requirements, true, true).label).toBe('Still building')
    expect(matchCoverage({ status: 'failed', error: 'x' }, requirements, true).label).toBe('Unavailable')
  })
})

describe('IntelligenceOverview coverage', () => {
  it('shows the same counts as the backend match', async () => {
    vi.mocked(api.getCandidateJdMatch).mockResolvedValue(match)
    render(<IntelligenceOverview candidate={exampleContext.candidate} context={exampleContext} job={job} inspectClaims={() => {}} />)
    expect(await screen.findByText('1/2')).toBeVisible()
    expect(screen.getByText('0/1 · 1 partial')).toBeVisible()
    expect(api.getCandidateJdMatch).toHaveBeenCalledWith(exampleContext.candidate.id, { job_id: 'J' })
  })
  it('shows a retry when the match fails and recovers', async () => {
    vi.mocked(api.getCandidateJdMatch).mockResolvedValueOnce({ status: 'failed', error: 'down' }).mockResolvedValue(match)
    render(<IntelligenceOverview candidate={exampleContext.candidate} context={exampleContext} job={job} inspectClaims={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Retry coverage' }))
    expect(await screen.findByText('1/2')).toBeVisible()
  })
  it('does not call the match API for roles without access', async () => {
    render(<IntelligenceOverview candidate={exampleContext.candidate} context={null} job={job} canMatch={false} inspectClaims={() => {}} />)
    expect(screen.getAllByText('Restricted')).toHaveLength(2)
    await waitFor(() => expect(api.getCandidateJdMatch).not.toHaveBeenCalled())
  })
})
