import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, type ReactNode } from 'react'
import { AuthContext, type AuthUser } from '@/context/AuthContext'
import { JobProvider, useJob } from '@/context/JobContext'
import { CandidateCard } from '@/components/cards/CandidateCard'
import { CandidateProfileShell } from '@/components/profile/CandidateProfileShell'
import { isMasked, locationLabel, visibleLocation } from '@/services/masking'
import { api } from '@/services/api'
import type { CandidateDetail } from '@/types'
import { exampleContext } from './evidenceFixtures'

vi.mock('@/services/api', () => ({ api: { getJobs: vi.fn(), getCandidates: vi.fn(), getCandidateById: vi.fn(), getCandidateContext: vi.fn(), getCandidateResume: vi.fn() } }))

const masked: CandidateDetail = { ...exampleContext.candidate, email: '***@***.***', location: '[Redacted]', masked_fields: ['email', 'location'] }

function as(roles: string[], children: ReactNode) {
  const user: AuthUser = { user_id: 'u1', email: 'm@acme.com', full_name: 'Manager', roles, status: 'active' }
  return <AuthContext.Provider value={{ user, accessToken: 'token', ready: true, isAuthenticated: true,
    hasRole: role => roles.includes('hr_admin') || roles.includes(role),
    login: async () => {}, logout: async () => {}, refreshToken: async () => {}, reloadIdentity: async () => {} }}>
    <JobProvider>{children}</JobProvider>
  </AuthContext.Provider>
}

function OpenProfile() {
  const { openCandidateDetail, selectedCandidateId } = useJob()
  useEffect(() => { openCandidateDetail('CAND-001') }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return selectedCandidateId ? <CandidateProfileShell /> : null
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.getJobs).mockResolvedValue([])
  vi.mocked(api.getCandidateById).mockResolvedValue(masked)
  vi.mocked(api.getCandidateContext).mockResolvedValue(exampleContext)
  vi.mocked(api.getCandidateResume).mockResolvedValue({ candidate_id: 'CAND-001', raw_text: 'Original resume text', source: 'pdf', char_count: 20 })
})
afterEach(cleanup)

describe('masked candidate fields (OI-04)', () => {
  it('treats masked values as hidden, never as data', () => {
    expect(isMasked(masked, 'email')).toBe(true)
    expect(visibleLocation(masked)).toBeNull()
    expect(locationLabel(masked)).toBe('Location hidden')
    const open = { ...exampleContext.candidate, location: 'Berlin', masked_fields: [] }
    expect(visibleLocation(open)).toBe('Berlin')
    expect(locationLabel({ ...open, location: '' })).toBe('')
  })

  it('shows "Location hidden" on a candidate card instead of the placeholder', () => {
    render(as(['hiring_manager'], <CandidateCard candidate={masked} />))
    expect(screen.getByText('Location hidden')).toBeVisible()
    expect(screen.queryByText('[Redacted]')).not.toBeInTheDocument()
  })
})

describe('resume access', () => {
  it('does not request the resume for a hiring manager', async () => {
    render(as(['hiring_manager'], <OpenProfile />))
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Resume Reference' }))
    expect(screen.getByText(/available to recruiters only/)).toBeVisible()
    expect(api.getCandidateResume).not.toHaveBeenCalled()
    expect(screen.queryByText(/\[Redacted\]/)).not.toBeInTheDocument()
  })

  it('shows the resume to recruiters', async () => {
    render(as(['recruiter'], <OpenProfile />))
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Resume Reference' }))
    expect(await screen.findByText('Original resume text')).toBeVisible()
  })
})
