import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BriefQuestionsTab } from '@/components/profile/BriefQuestionsTab'
import { EvidenceExplorer } from '@/components/evidence/EvidenceExplorer'
import { JobProvider } from '@/context/JobContext'
import { api } from '@/services/api'
import type { CandidateBrief, InterviewQuestionSet } from '@/types'
import { exampleContext } from './evidenceFixtures'

vi.mock('@/services/api', () => ({ api: {
  recordExport: vi.fn(), generateBrief: vi.fn(), generateInterviewQuestions: vi.fn(),
  getJobs: vi.fn(), getCandidates: vi.fn(), getCandidateContext: vi.fn(),
} }))

const brief: CandidateBrief = { candidate_id: 'CAND-001', job_id: 'JOB-001', generated_at: '2026-11-19T00:00:00Z', provider_used: 'gemini',
  strengths: 'Python [OBS-1]', evidence_summary: 'Repo.', application_history_notes: 'None.', identified_gaps: 'None.', grounding_ids: ['OBS-1'] }
const questions: InterviewQuestionSet = { candidate_id: 'CAND-001', job_id: 'JOB-001', generated_at: '2026-11-19T00:00:00Z', provider_used: 'groq',
  grounding_ids: ['CLAIM-1'], questions: [{ question_text: 'Explain?', target_type: 'unverified_claim', source_id: 'CLAIM-1', rationale: 'Unverified.' }] }

let order: string[]
let click: ReturnType<typeof vi.spyOn>
let writeText: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.resetAllMocks()
  order = []
  vi.mocked(api.recordExport).mockImplementation(async () => { order.push('recorded'); return { recorded: true } })
  vi.mocked(api.generateBrief).mockResolvedValue(brief)
  vi.mocked(api.generateInterviewQuestions).mockResolvedValue(questions)
  vi.mocked(api.getJobs).mockResolvedValue([])
  vi.mocked(api.getCandidates).mockResolvedValue([exampleContext.candidate])
  vi.mocked(api.getCandidateContext).mockResolvedValue(exampleContext)
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:x') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { order.push('downloaded') })
  writeText = vi.fn(async () => { order.push('copied') })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})
afterEach(() => { cleanup(); click.mockRestore() })

async function withBrief() {
  const user = userEvent.setup()
  render(<BriefQuestionsTab candidateId="CAND-001" jobId="JOB-001" />)
  await user.click(screen.getByRole('button', { name: 'Generate Brief' }))
  await screen.findByRole('button', { name: 'Download as TXT' })
  return user
}

it('records a brief download before the file is saved (OI-08)', async () => {
  const user = await withBrief()
  await user.click(screen.getByRole('button', { name: 'Download as TXT' }))
  await waitFor(() => expect(order).toEqual(['recorded', 'downloaded']))
  expect(api.recordExport).toHaveBeenCalledWith({ kind: 'brief', candidate_id: 'CAND-001', job_id: 'JOB-001', format: 'txt' })
})

it('does not download when the export cannot be recorded', async () => {
  const user = await withBrief()
  vi.mocked(api.recordExport).mockRejectedValueOnce(new Error('API error 503'))
  await user.click(screen.getByRole('button', { name: 'Download as TXT' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be recorded')
  expect(click).not.toHaveBeenCalled()
})

it('records the "Export brief" action from the profile header', async () => {
  render(<BriefQuestionsTab candidateId="CAND-001" jobId="JOB-001" exportRequest={1} />)
  await waitFor(() => expect(order).toEqual(['recorded', 'downloaded']))
})

it('records clipboard copies of the brief and of the questions', async () => {
  const user = await withBrief()
  // userEvent.setup() installs its own clipboard; put the spy back.
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  await user.click(screen.getByRole('button', { name: 'Copy to Clipboard' }))
  await waitFor(() => expect(writeText).toHaveBeenCalled())
  expect(api.recordExport).toHaveBeenLastCalledWith({ kind: 'brief', candidate_id: 'CAND-001', job_id: 'JOB-001', format: 'clipboard' })
  await user.click(screen.getByRole('button', { name: 'Interview Questions' }))
  await user.click(screen.getByRole('button', { name: 'Generate Questions' }))
  await user.click(await screen.findByRole('button', { name: 'Copy All Questions' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
  expect(api.recordExport).toHaveBeenLastCalledWith({ kind: 'questions', candidate_id: 'CAND-001', job_id: 'JOB-001', item_count: 1, format: 'clipboard' })
  expect(order).toEqual(['recorded', 'copied', 'recorded', 'copied'])
})

it('records an evidence export, and blocks it when recording fails', async () => {
  const user = userEvent.setup()
  render(<JobProvider><EvidenceExplorer /></JobProvider>)
  const button = await screen.findByRole('button', { name: 'Export evidence' })
  await waitFor(() => expect(button).toBeEnabled())
  vi.mocked(api.recordExport).mockRejectedValueOnce(new Error('API error 503'))
  await user.click(button)
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be recorded')
  expect(click).not.toHaveBeenCalled()
  await user.click(button)
  await waitFor(() => expect(order).toEqual(['recorded', 'downloaded']))
  expect(api.recordExport).toHaveBeenLastCalledWith({ kind: 'evidence', item_count: exampleContext.evidence_records.length, format: 'json' })
})
