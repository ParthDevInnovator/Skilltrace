import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { JobProvider, useJob } from '@/context/JobContext'
import { api } from '@/services/api'
import type { ExtractedRequirement } from '@/types/matching'

vi.mock('@/services/api', () => ({ api: { getJobs: vi.fn(), createJob: vi.fn() } }))

const probe = {} as { job: ReturnType<typeof useJob> }
function Probe() { const value = useJob(); useEffect(() => { probe.job = value }); return null }
afterEach(() => { cleanup(); vi.clearAllMocks() })

const clientRequirements = [
  { id: 'REQ-1', requirement_text: 'Python', normalized_text: 'python', skill_aliases: [], category: 'Backend', is_mandatory: true },
] as ExtractedRequirement[]
const serverRequirements = [
  { id: 'CUSTOM-ABC-REQ-001', requirement_text: 'Python', category: 'Backend', is_mandatory: true },
]

async function create(extractionFailed = false) {
  vi.mocked(api.getJobs).mockResolvedValue([])
  vi.mocked(api.createJob).mockResolvedValue({
    id: 'CUSTOM-ABC', title: 'Backend', department: 'Eng', location: 'Remote', description_raw: 'Python',
    requirements: serverRequirements, requirements_preview: ['Python'],
  } as never)
  render(<JobProvider><Probe /></JobProvider>)
  await waitFor(() => expect(probe.job.isLoadingJobs).toBe(false))
  await act(() => probe.job.createCustomJob('Backend', 'Python', 'Eng', 'Remote', clientRequirements, extractionFailed))
}

it('keeps the server requirement IDs for a new job, not the client extraction IDs (OI-09)', async () => {
  await create()
  expect(api.createJob).toHaveBeenCalledWith(expect.objectContaining({ requirements: clientRequirements }))
  expect(probe.job.selectedJob?.requirements?.map(r => r.id)).toEqual(['CUSTOM-ABC-REQ-001'])
  expect(probe.job.jobs[0].requirements?.map(r => r.id)).toEqual(['CUSTOM-ABC-REQ-001'])
  expect(probe.job.selectedJob?.extraction_failed).toBe(false)
})

it('still flags a failed extraction while using the server requirements', async () => {
  await create(true)
  expect(probe.job.selectedJob?.extraction_failed).toBe(true)
  expect(probe.job.selectedJob?.requirements?.map(r => r.id)).toEqual(['CUSTOM-ABC-REQ-001'])
})
