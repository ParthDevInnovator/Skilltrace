import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddCandidatesView } from '@/components/dashboard/AddCandidatesView'
import { ApiError, api } from '@/services/api'
import { resetBatchQueue } from '@/services/batchQueue'
import { exampleContext } from './evidenceFixtures'

const openCandidateDetail = vi.fn(), startPipeline = vi.fn(), setActiveView = vi.fn()
vi.mock('@/context/JobContext', () => ({ useJob: () => ({ selectedJob: { id: 'J', title: 'Engineer' }, setActiveView, openCandidateDetail, startPipeline }) }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ hasRole: () => true }) }))
vi.mock('@/components/dashboard/ResumeUpload', () => ({ ResumeUpload: () => null }))
vi.mock('@/services/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return { ApiError: actual.ApiError, api: { uploadResume: vi.fn(), getCandidateContext: vi.fn() } }
})

const file = (name: string, text = 'resume text', lastModified = 1) => new File([text], name, { type: 'text/plain', lastModified })
const rejected = (status: number, detail: unknown) => new ApiError(status, '/api/v1/ingest/resume', JSON.stringify({ detail }))
const row = (text: RegExp) => screen.getAllByRole('listitem').find(item => text.test(item.textContent ?? ''))!
const upload = (user: ReturnType<typeof userEvent.setup>, files: File[]) => user.upload(screen.getByLabelText('Batch resume files'), files)

beforeEach(() => {
  vi.resetAllMocks()
  resetBatchQueue()
  let n = 0
  vi.mocked(api.uploadResume).mockImplementation(async () => ({ candidate_id: `C${++n}`, status: 'building', context_revision: `r${n}` }))
  vi.mocked(api.getCandidateContext).mockResolvedValue(exampleContext)
})
afterEach(() => { resetBatchQueue(); vi.useRealTimers() })

it('reports Analyzed only after the context is ready, not at HTTP 202 (OI-24)', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.mocked(api.getCandidateContext).mockResolvedValueOnce({ candidate_id: 'C1', status: 'building' }).mockResolvedValue(exampleContext)
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(<AddCandidatesView />)
  await upload(user, [file('a.txt')])
  await user.click(screen.getByRole('button', { name: 'Start Batch Analysis (1)' }))
  expect(await screen.findByText(/Uploaded · analyzing/)).toBeVisible()
  expect(screen.queryByRole('button', { name: 'View candidates' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'View progress for a.txt' }))
  expect(startPipeline).toHaveBeenCalledWith('C1')
  await vi.advanceTimersByTimeAsync(4000)
  expect(await screen.findByText('Analyzed')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'View a.txt' }))
  expect(openCandidateDetail).toHaveBeenCalledWith('C1')
  expect(screen.getByRole('button', { name: 'View candidates' })).toBeVisible()
})

it('shows a background analysis failure for that file (OI-24)', async () => {
  vi.mocked(api.getCandidateContext).mockRejectedValue(new ApiError(503, '/context', JSON.stringify({ detail: 'Context build failed.' })))
  const user = userEvent.setup()
  render(<AddCandidatesView />)
  await upload(user, [file('a.txt')])
  await user.click(screen.getByRole('button', { name: 'Start Batch Analysis (1)' }))
  expect(await screen.findByText('Analysis failed — Context build failed.')).toBeVisible()
})

it('tracks same-name files as separate entries and does not reuse a removed file\'s status (OI-25)', async () => {
  const user = userEvent.setup()
  render(<AddCandidatesView />)
  await upload(user, [file('resume.txt', 'first', 1), file('resume.txt', 'second one', 2), file('resume.txt', 'first', 1)])
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  await user.click(screen.getByRole('button', { name: 'Start Batch Analysis (2)' }))
  expect(await screen.findAllByText('Analyzed')).toHaveLength(2)
  expect(api.uploadResume).toHaveBeenCalledTimes(2)
  await user.click(screen.getAllByRole('button', { name: 'Remove resume.txt' })[0])
  await upload(user, [file('resume.txt', 'a different resume', 3)])
  expect(within(screen.getAllByRole('listitem')[1]).getByText('Ready to upload')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Start Batch Analysis (1)' }))
  expect(await screen.findAllByText('Analyzed')).toHaveLength(2)
  expect(api.uploadResume).toHaveBeenCalledTimes(3)
})

it('asks for the missing identity in place and uploads with the correction (OI-26)', async () => {
  vi.mocked(api.uploadResume).mockRejectedValueOnce(rejected(422, { code: 'missing_identity', field: 'email', message: 'An email is required.' }))
  const user = userEvent.setup()
  render(<AddCandidatesView />)
  await upload(user, [file('anon.txt')])
  await user.click(screen.getByRole('button', { name: 'Start Batch Analysis (1)' }))
  expect(await screen.findByText('Needs candidate details — An email is required.')).toBeVisible()
  await user.type(screen.getByLabelText('Email for anon.txt'), 'anon@example.com')
  await user.click(screen.getByRole('button', { name: 'Upload with correction' }))
  expect(await screen.findByText('Analyzed')).toBeVisible()
  const sent = vi.mocked(api.uploadResume).mock.calls[1][0]
  expect(sent.get('email')).toBe('anon@example.com')
})

it('separates rejected input from retryable network failures (OI-26)', async () => {
  vi.mocked(api.uploadResume)
    .mockRejectedValueOnce(rejected(422, { code: 'unreadable', message: 'Could not read resume text.' }))
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
  const user = userEvent.setup()
  render(<AddCandidatesView />)
  await upload(user, [file('scan.txt', 'a', 1), file('ok.txt', 'b', 2)])
  await user.click(screen.getByRole('button', { name: 'Start Batch Analysis (2)' }))
  expect(await screen.findByText('Rejected — Could not read resume text.')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Retry scan.txt' })).not.toBeInTheDocument()
  expect(within(row(/ok\.txt/)).getByText(/Upload failed/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Retry ok.txt' }))
  expect(await screen.findByText('Analyzed')).toBeVisible()
})

it('keeps the queue and results after leaving the page (OI-26)', async () => {
  const user = userEvent.setup()
  const { unmount } = render(<AddCandidatesView />)
  await upload(user, [file('a.txt'), file('empty.txt', '', 2)])
  await user.click(screen.getByRole('button', { name: 'Start Batch Analysis (1)' }))
  expect(await screen.findByText('Analyzed')).toBeVisible()
  unmount()
  render(<AddCandidatesView />)
  expect(screen.getByText('Analyzed')).toBeVisible()
  expect(screen.getByText('Cannot upload — This file is empty.')).toBeVisible()
  expect(screen.getByText('Batch Upload · 2 files queued')).toBeVisible()
})
