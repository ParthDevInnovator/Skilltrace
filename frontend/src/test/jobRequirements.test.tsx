import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { JobProvider, useJob } from '@/context/JobContext'
import { api } from '@/services/api'

vi.mock('@/services/api', () => ({ api: { getJobs: vi.fn(), createJob: vi.fn(), updateJob: vi.fn() } }))

const probe = {} as { job: ReturnType<typeof useJob> }
function Probe() { const value = useJob(); useEffect(() => { probe.job = value }); return null }
afterEach(() => { cleanup(); vi.clearAllMocks() })

const clientRequirements = [{ id: 'REQ-1', requirement_text: 'Python', category: 'Backend', is_mandatory: true }]
const serverRequirements = [
  { id: 'CUSTOM-ABC-REQ-001', requirement_text: 'Python', category: 'Backend', is_mandatory: true },
]

async function create() {
  vi.mocked(api.getJobs).mockResolvedValue([])
  vi.mocked(api.createJob).mockResolvedValue({
    id: 'CUSTOM-ABC', title: 'Backend', department: 'Eng', location: 'Remote', description_raw: 'Python',
    requirements: serverRequirements, requirements_preview: ['Python'],
  } as never)
  render(<JobProvider><Probe /></JobProvider>)
  await waitFor(() => expect(probe.job.isLoadingJobs).toBe(false))
  await act(async () => { await probe.job.createCustomJob({ title: 'Backend', description_raw: 'Python', department: 'Eng', location: 'Remote', requirements: clientRequirements }) })
}

it('keeps the server requirement IDs for a new job, not the client extraction IDs (OI-09)', async () => {
  await create()
  expect(api.createJob).toHaveBeenCalledWith(expect.objectContaining({ requirements: clientRequirements }))
  expect(probe.job.selectedJob?.requirements?.map(r => r.id)).toEqual(['CUSTOM-ABC-REQ-001'])
  expect(probe.job.jobs[0].requirements?.map(r => r.id)).toEqual(['CUSTOM-ABC-REQ-001'])
})

it('replaces the cached job with the saved edit (OI-31)', async () => {
  await create()
  vi.mocked(api.updateJob).mockResolvedValue({ ...probe.job.jobs[0], title: 'Senior Backend', status: 'closed' })
  await act(async () => { await probe.job.updateJob('CUSTOM-ABC', { title: 'Senior Backend', status: 'closed' }) })
  expect(api.updateJob).toHaveBeenCalledWith('CUSTOM-ABC', { title: 'Senior Backend', status: 'closed' })
  expect(probe.job.jobs.map(job => [job.title, job.status])).toEqual([['Senior Backend', 'closed']])
  expect(probe.job.selectedJob?.status).toBe('closed')
})
