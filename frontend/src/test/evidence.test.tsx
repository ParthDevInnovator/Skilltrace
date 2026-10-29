import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EvidenceBar } from '@/components/evidence/EvidenceBar'
import { EvidenceCard } from '@/components/evidence/EvidenceCard'
import { EvidenceExplorer } from '@/components/evidence/EvidenceExplorer'
import { ResumeViewer } from '@/components/profile/ResumeViewer'
import { CandidateProfileShell } from '@/components/profile/CandidateProfileShell'
import { CandidateCard } from '@/components/cards/CandidateCard'
import { JobProvider, useJob } from '@/context/JobContext'
import { useCandidateContext } from '@/hooks/useCandidateContext'
import { EVIDENCE_LABELS, labelForScore } from '@/types/context'
import { api } from '@/services/api'
import { exampleContext, exampleRecord } from './evidenceFixtures'
vi.mock('@/services/api', () => ({ api: { getJobs: vi.fn(), getCandidates: vi.fn(), getCandidateById: vi.fn(), getCandidateContext: vi.fn(), getCandidateResume: vi.fn() } }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.getJobs).mockResolvedValue([])
  vi.mocked(api.getCandidates).mockResolvedValue([exampleContext.candidate])
  vi.mocked(api.getCandidateById).mockResolvedValue(exampleContext.candidate)
  vi.mocked(api.getCandidateContext).mockResolvedValue(exampleContext)
  vi.mocked(api.getCandidateResume).mockResolvedValue({ candidate_id: 'CAND-001', raw_text: 'Synthetic resume text', source: 'stub', char_count: 21 })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
it.each([0, .5, 2, 2.1, 5, 5.1, 9, 9.1, 15])('shows an accessible tier for %s points', score => {
  const label = labelForScore(score)
  render(<EvidenceBar score={score} label={label} />)
  const meter = screen.getByRole('meter')
  expect(meter).toHaveAttribute('aria-valuenow', String(score))
  expect(meter).toHaveAccessibleName(`Evidence strength: ${label}`)
  expect(meter.querySelectorAll('[data-active=true]')).toHaveLength(EVIDENCE_LABELS.indexOf(label) + 1)
})
it('respects reduced motion', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  render(<EvidenceBar score={.7} label="Limited" />)
  expect(screen.getByRole('meter')).not.toHaveClass('evidence-animate')
})
it('expands a source audit with keyboard activation and visible synthetic provenance', async () => {
  const user = userEvent.setup(); render(<EvidenceCard record={exampleRecord} />)
  const toggle = screen.getByRole('button')
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  expect(screen.getByText(exampleRecord.provenance)).toBeVisible()
  toggle.focus(); await user.keyboard('{Enter}')
  expect(screen.getByRole('link', { name: 'Inspect source' })).toHaveAttribute('href', exampleRecord.source_url)
  expect(screen.getByText('Weight: 1 x 0.7 = 0.7')).toBeVisible()
  await user.keyboard(' ')
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
})
it('renders a stub resume and copies text', async () => {
  const user = userEvent.setup()
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  render(<ResumeViewer candidateId="CAND-001" />)
  expect(await screen.findByText('Synthetic resume text')).toBeVisible()
  expect(screen.getByText('STUB')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Copy resume text' }))
  expect(write).toHaveBeenCalledWith('Synthetic resume text')
  expect(await screen.findByText('Copied resume text')).toBeVisible()
})
it('handles HTTP 204 as an empty resume', async () => {
  vi.mocked(api.getCandidateResume).mockResolvedValue(null)
  render(<ResumeViewer candidateId="CAND-001" />)
  expect(await screen.findByText('No resume text is available.')).toBeVisible()
})
function ProfileHarness() {
  const { openCandidateDetail, selectedCandidateId } = useJob()
  return selectedCandidateId ? <CandidateProfileShell /> : <button onClick={() => openCandidateDetail('CAND-001')}>Open candidate</button>
}
it('shows context-building, retries an error, and keeps claims unverified beside evidence', async () => {
  const user = userEvent.setup()
  vi.mocked(api.getCandidateContext).mockRejectedValueOnce(new Error('503'))
  render(<JobProvider><ProfileHarness /></JobProvider>)
  await user.click(screen.getByRole('button', { name: 'Open candidate' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Evidence could not be loaded')
  await user.click(screen.getByRole('button', { name: 'Retry evidence' }))
  expect(await screen.findByText('Built Python services')).toBeVisible()
  expect(screen.getByText('unverified')).toBeVisible()
  expect(screen.queryByText('supported')).not.toBeInTheDocument()
  expect(screen.getByText('Synthetic evidence fixtures - not live verification')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Reported Skills' }))
  expect(screen.getByText(/1 observations/)).toBeVisible()
})
function HookHarness() {
  const state = useCandidateContext('CAND-001')
  return <><span>{state.phase}</span><button onClick={state.retry}>Retry</button></>
}
it('polls building contexts at 3 seconds and stops after 10 attempts', async () => {
  vi.useFakeTimers()
  vi.mocked(api.getCandidateContext).mockResolvedValue({ candidate_id: 'CAND-001', status: 'building' })
  const { unmount } = render(<HookHarness />)
  await act(async () => { await Promise.resolve() })
  expect(screen.getByText('building')).toBeVisible()
  for (let i = 0; i < 9; i++) await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  expect(api.getCandidateContext).toHaveBeenCalledTimes(10)
  expect(screen.getByText('waiting')).toBeVisible()
  await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
  expect(api.getCandidateContext).toHaveBeenCalledTimes(10)
  unmount()
})
it('keeps cards unassessed while building, then shows computed evidence', async () => {
  let resolve: (value: typeof exampleContext) => void = () => {}
  vi.mocked(api.getCandidateContext).mockReturnValue(new Promise(done => { resolve = done }))
  render(<JobProvider><CandidateCard candidate={exampleContext.candidate} /></JobProvider>)
  expect(screen.getByText('Unassessed')).toBeVisible()
  await act(async () => { resolve(exampleContext) })
  expect(await screen.findByRole('meter')).toHaveAttribute('aria-valuenow', '0.7')
  expect(screen.getByText('Unassessed')).toBeVisible() // Evidence readiness does not assess role fit.
})
function ExplorerHarness() {
  const { selectedCandidateId } = useJob()
  return <><EvidenceExplorer /><output>{selectedCandidateId}</output></>
}
it('filters Explorer by tier/source/min score and navigates to the right candidate', async () => {
  const user = userEvent.setup()
  const second = { ...exampleContext.candidate, id: 'CAND-002', full_name: 'Jordan Test' }
  vi.mocked(api.getCandidates).mockResolvedValue([exampleContext.candidate, second])
  vi.mocked(api.getCandidateContext).mockImplementation(async id => id === 'CAND-001' ? exampleContext : { ...exampleContext, candidate: second, claims: [], evidence_records: [], evidence_score: 0, evidence_label: 'No public evidence' })
  render(<JobProvider><ExplorerHarness /></JobProvider>)
  expect(await screen.findByRole('button', { name: 'Inspect Jordan Test' })).toBeVisible()
  await user.selectOptions(screen.getByLabelText('Evidence tier'), 'Limited')
  expect(screen.queryByRole('button', { name: 'Inspect Jordan Test' })).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Source type'), 'linkedin')
  await user.type(screen.getByLabelText('Minimum evidence score'), '1')
  expect(screen.getByText('No candidates match the evidence filters.')).toBeVisible()
  await user.clear(screen.getByLabelText('Minimum evidence score'))
  await user.click(screen.getByRole('button', { name: 'Inspect Alex Chen' }))
  expect(screen.getByText('CAND-001')).toBeVisible()
})
it('shows an Explorer error and retries', async () => {
  const user = userEvent.setup()
  vi.mocked(api.getCandidates).mockRejectedValueOnce(new Error('offline'))
  render(<JobProvider><EvidenceExplorer /></JobProvider>)
  expect(await screen.findByRole('alert')).toHaveTextContent('could not load')
  await user.click(screen.getByRole('button', { name: 'Retry explorer' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Inspect Alex Chen' })).toBeVisible())
})

it('automatically replaces a 202 response with the ready context', async () => {
  vi.useFakeTimers()
  vi.mocked(api.getCandidateContext).mockResolvedValueOnce({ candidate_id: 'CAND-001', status: 'building' }).mockResolvedValue(exampleContext)
  render(<HookHarness />)
  await act(async () => { await Promise.resolve() })
  expect(screen.getByText('building')).toBeVisible()
  await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  expect(screen.getByText('ready')).toBeVisible()
  expect(api.getCandidateContext).toHaveBeenCalledTimes(2)
})
