import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BriefQuestionsTab, formatBrief } from '@/components/profile/BriefQuestionsTab'
import { api } from '@/services/api'
import type { CandidateBrief, InterviewQuestionSet } from '@/types'

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ hasRole: () => true }) }))
vi.mock('@/services/api', () => ({ api: { recordExport: vi.fn(), generateBrief: vi.fn(), generateInterviewQuestions: vi.fn() } }))

// OI-17: generated content belongs to one candidate, job and context revision.
const brief = (job_id: string, strengths: string): CandidateBrief => ({ candidate_id: 'C1', job_id, generated_at: '2026-11-23T10:00:00Z', provider_used: 'gemini', strengths, evidence_summary: 'Summary', application_history_notes: 'None', identified_gaps: 'Gaps', grounding_ids: ['OBS-1'] })
const questions = (job_id: string, text: string): InterviewQuestionSet => ({ candidate_id: 'C1', job_id, generated_at: '2026-11-23T10:00:00Z', provider_used: 'groq', grounding_ids: [], questions: [{ question_text: text, target_type: 'coverage_gap', source_id: 'REQ-1', rationale: 'Gap' }] })

beforeEach(() => { vi.resetAllMocks(); vi.mocked(api.recordExport).mockResolvedValue(undefined as never) })

it('hides a brief generated for the previous job after the job changes', async () => {
  vi.mocked(api.generateBrief).mockImplementation(async (_id, body) => brief(body.job_id!, `Strengths for ${body.job_id}`))
  const user = userEvent.setup()
  const { rerender } = render(<BriefQuestionsTab candidateId="C1" jobId="J1" jobTitle="Backend" />)
  await user.click(screen.getByRole('button', { name: 'Generate Brief' }))
  expect(await screen.findByText('Strengths for J1')).toBeVisible()
  rerender(<BriefQuestionsTab candidateId="C1" jobId="J2" jobTitle="Frontend" />)
  expect(screen.queryByText('Strengths for J1')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Download as TXT' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Generate Brief' }))
  expect(await screen.findByText('Strengths for J2')).toBeVisible()
  expect(api.generateBrief).toHaveBeenLastCalledWith('C1', { job_id: 'J2' })
})

it('drops a late response for the previous job', async () => {
  let resolve!: (value: InterviewQuestionSet) => void
  vi.mocked(api.generateInterviewQuestions).mockReturnValueOnce(new Promise(r => { resolve = r }))
  const user = userEvent.setup()
  const { rerender } = render(<BriefQuestionsTab candidateId="C1" jobId="J1" />)
  await user.click(screen.getByRole('button', { name: 'Interview Questions' }))
  await user.click(screen.getByRole('button', { name: 'Generate Questions' }))
  rerender(<BriefQuestionsTab candidateId="C1" jobId="J2" />)
  expect(screen.getByRole('button', { name: 'Generate Questions' })).toBeEnabled()
  resolve(questions('J1', 'Old job question?'))
  await waitFor(() => expect(api.generateInterviewQuestions).toHaveBeenCalledOnce())
  await new Promise(r => setTimeout(r, 0))
  expect(screen.queryByText('Old job question?')).not.toBeInTheDocument()
})

it('hides content when the context revision changes', async () => {
  vi.mocked(api.generateBrief).mockResolvedValue(brief('J1', 'Revision one'))
  const user = userEvent.setup()
  const { rerender } = render(<BriefQuestionsTab candidateId="C1" jobId="J1" contextRevision="2026-11-23T09:00:00Z" />)
  await user.click(screen.getByRole('button', { name: 'Generate Brief' }))
  expect(await screen.findByText('Revision one')).toBeVisible()
  rerender(<BriefQuestionsTab candidateId="C1" jobId="J1" contextRevision="2026-11-23T11:00:00Z" />)
  expect(screen.queryByText('Revision one')).not.toBeInTheDocument()
})

it('labels downloaded briefs with their candidate, job, date and sources', () => {
  const text = formatBrief(brief('J1', 'Python'), { candidateName: 'Maya Chen', jobTitle: 'Backend', contextRevision: '2026-11-23T09:00:00Z' })
  expect(text).toContain('Candidate: Maya Chen (C1)')
  expect(text).toContain('Job: Backend (J1)')
  expect(text).toContain('Generated: 2026-11-23T10:00:00Z')
  expect(text).toContain('Evidence as of: 2026-11-23T09:00:00Z')
  expect(text).toContain('Sources cited\nOBS-1')
  expect(formatBrief({ ...brief('J1', 'x'), job_id: null })).toContain('Job: none (general brief)')
})
