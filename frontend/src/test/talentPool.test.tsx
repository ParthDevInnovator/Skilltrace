import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TalentPoolView } from '@/components/dashboard/TalentPoolView'
import { api } from '@/services/api'
const openCandidateDetail = vi.fn()
const setActiveView = vi.fn()
const compareCandidate = vi.fn()
vi.mock('@/context/JobContext', () => ({ useJob: () => ({ selectedJob: { id: 'J1', title: 'Engineer' }, searchQuery: '', openCandidateDetail, compareCandidate, setActiveView }) }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ hasRole: () => true }) }))
vi.mock('@/services/api', () => ({ api: { getCandidates: vi.fn(), rankCandidates: vi.fn(), getCandidateById: vi.fn() } }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.getCandidates).mockResolvedValue([
    { id: 'A', full_name: 'Maya Chen', email: '', headline: 'Backend Engineer', location: 'Berlin', top_skills: ['Python'] },
    { id: 'B', full_name: 'Jonas Weber', email: '', headline: 'Engineer', location: 'Munich', top_skills: ['React'] },
  ])
  vi.mocked(api.rankCandidates).mockResolvedValue([])
})
it('filters by reported skill and search, then opens intelligence', async () => {
  const user = userEvent.setup()
  render(<TalentPoolView />)
  await screen.findByText('Maya Chen')
  await user.selectOptions(screen.getByLabelText('Filter by skill'), 'Python')
  expect(screen.queryByText('Jonas Weber')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  await user.type(screen.getByLabelText('Search talent pool'), 'Munich')
  expect(screen.queryByText('Maya Chen')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'View Intelligence for Jonas Weber' }))
  expect(openCandidateDetail).toHaveBeenCalledWith('B')
})
it('retains selected candidate when opening comparison and routes resume upload', async () => {
  const user = userEvent.setup()
  render(<TalentPoolView />)
  await user.click(await screen.findByRole('button', { name: 'Compare Maya Chen' }))
  expect(compareCandidate).toHaveBeenCalledWith('A')
  await user.click(screen.getByRole('button', { name: 'Add Resumes' }))
  expect(setActiveView).toHaveBeenCalledWith('add-candidates')
})
const rankBase = { full_name: 'Maya Chen', headline: '', resume_fit: .8, evidence_strength: .8, final_score: .82, evidence_label: 'Good' as const, coverage_counts: { matched: 0, partially_supported: 0, insufficient_evidence: 0, not_assessed: 0 }, coverage: [] }
it('polls building assessments until background analysis finishes (OI-13)', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    vi.mocked(api.rankCandidates)
      .mockResolvedValueOnce([{ ...rankBase, candidate_id: 'A', context_status: 'building' }])
      .mockResolvedValue([{ ...rankBase, candidate_id: 'A', context_status: 'ready' }])
    render(<TalentPoolView />)
    expect(await screen.findByText(/still being analyzed/)).toBeVisible()
    expect(screen.queryByText('82')).not.toBeInTheDocument()
    await vi.advanceTimersByTimeAsync(4000)
    expect(await screen.findByText('82')).toBeVisible()
    expect(screen.queryByText(/still being analyzed/)).not.toBeInTheDocument()
  } finally { vi.useRealTimers() }
})
it('stops polling after the limit and offers a refresh (OI-13)', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    vi.mocked(api.rankCandidates).mockResolvedValue([{ ...rankBase, candidate_id: 'A', context_status: 'building' }])
    render(<TalentPoolView />)
    await screen.findByText(/still being analyzed/)
    for (let i = 0; i < 16; i++) await vi.advanceTimersByTimeAsync(4000)
    expect(await screen.findByText(/taking longer than expected/)).toBeVisible()
    const calls = vi.mocked(api.rankCandidates).mock.calls.length
    expect(calls).toBe(16)
    await vi.advanceTimersByTimeAsync(20000)
    expect(vi.mocked(api.rankCandidates).mock.calls.length).toBe(calls)
    vi.mocked(api.rankCandidates).mockResolvedValue([{ ...rankBase, candidate_id: 'A', context_status: 'ready' }])
    screen.getByRole('button', { name: 'Refresh assessments' }).click()
    expect(await screen.findByText('82')).toBeVisible()
  } finally { vi.useRealTimers() }
})
