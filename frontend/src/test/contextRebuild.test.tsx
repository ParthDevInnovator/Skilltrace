import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCandidateContext } from '@/hooks/useCandidateContext'
import { ContextFeedback } from '@/components/evidence/ContextFeedback'
import { ApiError, api } from '@/services/api'
import { exampleContext } from './evidenceFixtures'

vi.mock('@/services/api', async importOriginal => ({
  ApiError: (await importOriginal<typeof import('@/services/api')>()).ApiError,
  api: { getCandidateContext: vi.fn(), rebuildCandidateContext: vi.fn() },
}))

// OI-27: retrying a failed build asks the server to rebuild; a request error only refetches.
function Probe() {
  const { phase, message, retry, context } = useCandidateContext('C1')
  return <><ContextFeedback phase={phase} message={message} retry={retry} />{context && <p>ready: {context.candidate.full_name}</p>}</>
}
const failed = new ApiError(503, '/context', JSON.stringify({ detail: 'Candidate context build failed. Retry the build.' }))

beforeEach(() => { vi.resetAllMocks(); vi.mocked(api.rebuildCandidateContext).mockResolvedValue({ candidate_id: 'C1', status: 'building' }) })

it('rebuilds a failed context and shows it once ready', async () => {
  vi.mocked(api.getCandidateContext).mockRejectedValueOnce(failed).mockResolvedValue(exampleContext)
  const user = userEvent.setup()
  render(<Probe />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Candidate analysis failed: Candidate context build failed. Retry the build.')
  await user.click(screen.getByRole('button', { name: 'Retry analysis' }))
  expect(await screen.findByText(`ready: ${exampleContext.candidate.full_name}`)).toBeVisible()
  expect(api.rebuildCandidateContext).toHaveBeenCalledWith('C1')
})

it('treats a 409 from rebuild as already restarted and keeps polling', async () => {
  vi.mocked(api.getCandidateContext).mockRejectedValueOnce(failed).mockResolvedValue(exampleContext)
  vi.mocked(api.rebuildCandidateContext).mockRejectedValue(new ApiError(409, '/rebuild', '{"detail":"ready"}'))
  const user = userEvent.setup()
  render(<Probe />)
  await user.click(await screen.findByRole('button', { name: 'Retry analysis' }))
  expect(await screen.findByText(/^ready:/)).toBeVisible()
})

it('only refetches after a request error', async () => {
  vi.mocked(api.getCandidateContext).mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(exampleContext)
  const user = userEvent.setup()
  render(<Probe />)
  await user.click(await screen.findByRole('button', { name: 'Retry evidence' }))
  expect(await screen.findByText(/^ready:/)).toBeVisible()
  expect(api.rebuildCandidateContext).not.toHaveBeenCalled()
})
