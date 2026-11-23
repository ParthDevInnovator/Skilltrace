import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CandidateComparisonView } from '@/components/dashboard/CandidateComparisonView'
import { JobProvider, useJob } from '@/context/JobContext'
import { api } from '@/services/api'
import { exampleContext } from './evidenceFixtures'
import type { CandidateMatchResult } from '@/types/matching'
import type { Job } from '@/types/job'

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ hasRole: () => true }) }))
vi.mock('@/services/api', () => ({ api: { getJobs: vi.fn(), getCandidates: vi.fn(), getCandidateJdMatch: vi.fn(), getCandidateContext: vi.fn(), rebuildCandidateContext: vi.fn() } }))

const job = { id: 'J', title: 'Backend Engineer', requirements: [] } as unknown as Job
const people = [
  { id: 'A', full_name: 'Maya Chen', email: '', headline: 'Backend', location: '', top_skills: ['Python'] },
  { id: 'B', full_name: 'Jonas Weber', email: '', headline: 'Platform', location: '', top_skills: ['Go'] },
  { id: 'C', full_name: 'Ana Silva', email: '', headline: 'Data', location: '', top_skills: ['SQL'] },
]
const match = (candidate_id: string, final_score: number): CandidateMatchResult => ({ candidate_id, job_id: 'J', reference_date: '2026-11-23', resume_fit: final_score, evidence_strength: .5, final_score, coverage: [], result_built_at: '2026-11-23T00:00:00Z' })
const context = (id: string) => ({ ...exampleContext, candidate: { ...exampleContext.candidate, id, experience_years: 4 } })

/** Mounts the comparison under the real workspace context, with buttons to leave and come back. */
function Harness() {
  const { activeView, setActiveView, compareCandidate, openCandidateDetail } = useJob()
  return <>
    <button onClick={() => compareCandidate('A')}>start</button>
    <button onClick={() => openCandidateDetail('B')}>inspect B</button>
    <button onClick={() => setActiveView('comparison')}>back to comparison</button>
    {activeView === 'comparison' ? <CandidateComparisonView /> : <p>view: {activeView}</p>}
  </>
}
const renderHarness = () => render(<JobProvider><Harness /></JobProvider>)

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.getJobs).mockResolvedValue([job])
  vi.mocked(api.getCandidates).mockResolvedValue(people)
  vi.mocked(api.getCandidateJdMatch).mockImplementation(async id => match(id, id === 'A' ? .8 : .6))
  vi.mocked(api.getCandidateContext).mockImplementation(async id => context(id))
  vi.mocked(api.rebuildCandidateContext).mockResolvedValue({ candidate_id: '', status: 'building' })
})
afterEach(() => { vi.useRealTimers() })

async function compareAll(user: ReturnType<typeof userEvent.setup>, names: string[]) {
  await user.click(screen.getByRole('button', { name: 'start' }))
  await user.click(await screen.findByRole('button', { name: /Add candidate$/ }))
  for (const name of names) await user.click(await screen.findByRole('checkbox', { name }))
}

it('keeps the comparison set while a profile is inspected (OI-16)', async () => {
  const user = userEvent.setup()
  renderHarness()
  await compareAll(user, ['Jonas Weber', 'Ana Silva'])
  expect(screen.getByText('3 selected · max 3')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'inspect B' }))
  expect(screen.getByText('view: candidate-detail')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'back to comparison' }))
  expect(await screen.findByText('3 selected · max 3')).toBeVisible()
  for (const name of ['Maya Chen', 'Jonas Weber', 'Ana Silva']) expect(screen.getByRole('button', { name: `Remove ${name}` })).toBeVisible()
})

it('polls a building context until the evidence is ready (OI-14)', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.mocked(api.getCandidateContext).mockResolvedValueOnce({ candidate_id: 'A', status: 'building' }).mockImplementation(async id => context(id))
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  renderHarness()
  await user.click(screen.getByRole('button', { name: 'start' }))
  expect((await screen.findAllByText('Evidence pending'))[0]).toBeVisible()
  await vi.advanceTimersByTimeAsync(3000)
  expect(await screen.findByText('4 yrs · reported')).toBeVisible()
  expect(api.getCandidateContext).toHaveBeenCalledTimes(2)
})

it('shows a failed context per column with a retry that recovers it (OI-14, OI-15)', async () => {
  vi.mocked(api.getCandidateContext).mockImplementation(async id => { if (id === 'B') throw new Error('503'); return context(id) })
  const user = userEvent.setup()
  renderHarness()
  await compareAll(user, ['Jonas Weber'])
  expect(await screen.findByText('4 yrs · reported')).toBeVisible()
  expect(screen.getAllByText('Evidence unavailable').length).toBeGreaterThan(0)
  vi.mocked(api.getCandidateContext).mockImplementation(async id => context(id))
  await user.click(screen.getByRole('button', { name: 'Retry Jonas Weber' }))
  await waitFor(() => expect(screen.getAllByText('4 yrs · reported')).toHaveLength(2))
  expect(screen.queryByRole('button', { name: 'Retry Jonas Weber' })).not.toBeInTheDocument()
})

it('keeps successful columns when another match fails and retries only the failed one (OI-15)', async () => {
  vi.mocked(api.getCandidateJdMatch).mockImplementation(async id => { if (id === 'B') throw new Error('offline'); return match(id, .8) })
  const user = userEvent.setup()
  renderHarness()
  await compareAll(user, ['Jonas Weber'])
  expect(await screen.findByText('80 / 100')).toBeVisible()
  expect(screen.getByText('Could not load assessment')).toBeVisible()
  vi.mocked(api.getCandidateJdMatch).mockImplementation(async id => match(id, id === 'A' ? .8 : .6))
  const before = vi.mocked(api.getCandidateJdMatch).mock.calls.filter(([id]) => id === 'A').length
  await user.click(screen.getByRole('button', { name: 'Retry Jonas Weber' }))
  expect(await screen.findByText('60 / 100')).toBeVisible()
  expect(vi.mocked(api.getCandidateJdMatch).mock.calls.filter(([id]) => id === 'A').length).toBe(before)
})

it('offers a retry for a failed assessment and after polling is exhausted (OI-15)', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.mocked(api.getCandidateJdMatch).mockImplementation(async id => id === 'A' ? { status: 'failed', error: 'boom' } : { status: 'building' })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  renderHarness()
  await compareAll(user, ['Jonas Weber'])
  expect(await screen.findByText('Assessment failed')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Retry Maya Chen' })).toBeVisible()
  for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(3000)
  expect(await screen.findByText('Still building assessment')).toBeVisible()
  vi.mocked(api.getCandidateJdMatch).mockImplementation(async id => match(id, .6))
  await user.click(screen.getByRole('button', { name: 'Retry Jonas Weber' }))
  expect(await screen.findByText('60 / 100')).toBeVisible()
})

it('retries a failed candidate list (OI-15)', async () => {
  vi.mocked(api.getCandidates).mockRejectedValueOnce(new Error('offline'))
  const user = userEvent.setup()
  renderHarness()
  await user.click(screen.getByRole('button', { name: 'start' }))
  await user.click(await screen.findByRole('button', { name: 'Retry comparison' }))
  expect(await screen.findByText('Maya Chen')).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
