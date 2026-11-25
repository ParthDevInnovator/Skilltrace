import { beforeEach, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GraphVisualization } from '@/components/graph/GraphVisualization'
import { api } from '@/services/api'
import type { CandidateSubgraph, GraphNode } from '@/types'

const openCandidateDetail = vi.fn()
let selectedJob: { id: string; title: string } | null = { id: 'JOB-001', title: 'Platform Engineer' }
vi.mock('@/context/JobContext', () => ({ useJob: () => ({ selectedJob, openCandidateDetail, setActiveView: vi.fn() }) }))
vi.mock('@/services/api', () => ({ api: { getCandidateGraph: vi.fn(), getGraphEvidence: vi.fn() } }))

const base: CandidateSubgraph = {
  nodes: [
    { id: 'CAND-001', label: 'Candidate', properties: { name: 'Alex' } },
    { id: 'Python', label: 'Skill', properties: { name: 'Python' } },
    { id: 'Go', label: 'Skill', properties: { name: 'Go' } },
    { id: 'Kafka', label: 'Skill', properties: { name: 'Kafka' } },
    { id: 'CAND-001:source:github', label: 'Source', properties: { name: 'GitHub', kind: 'github' } },
    { id: 'CAND-001:project:https://github.com/octo/widgets', label: 'Project', properties: { name: 'octo/widgets', source: 'github', url: 'https://github.com/octo/widgets' } },
  ],
  edges: [
    { source_id: 'CAND-001', target_id: 'Kafka', relationship: 'CLAIMS' },
    { source_id: 'CAND-001', target_id: 'CAND-001:source:github', relationship: 'HAS_SOURCE' },
    { source_id: 'CAND-001:source:github', target_id: 'CAND-001:project:https://github.com/octo/widgets', relationship: 'LISTS' },
    { source_id: 'CAND-001:project:https://github.com/octo/widgets', target_id: 'Python', relationship: 'INDICATES' },
  ],
}
const withRole: CandidateSubgraph = {
  nodes: [...base.nodes,
    { id: 'job:JOB-001', label: 'Job', properties: { title: 'Platform Engineer' } },
    { id: 'job:JOB-001:REQ-1', label: 'Requirement', properties: { name: 'Python services', coverage_state: 'matched', is_mandatory: true, observation: 'Claims and evidence agree.' } }],
  edges: [...base.edges,
    { source_id: 'CAND-001', target_id: 'job:JOB-001', relationship: 'CONSIDERED_FOR' },
    { source_id: 'job:JOB-001', target_id: 'job:JOB-001:REQ-1', relationship: 'REQUIRES' },
    { source_id: 'Python', target_id: 'job:JOB-001:REQ-1', relationship: 'SUPPORTS' }],
  job_scope: { job_id: 'JOB-001', title: 'Platform Engineer', status: 'included' },
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
const project = (name: string): GraphNode => ({ id: name, label: 'Project', properties: { name, observations: [`Observation for ${name}`] } })

beforeEach(() => {
  vi.resetAllMocks()
  selectedJob = { id: 'JOB-001', title: 'Platform Engineer' }
  vi.mocked(api.getCandidateGraph).mockResolvedValue(withRole)
  vi.mocked(api.getGraphEvidence).mockResolvedValue([])
})

it('requests the job-scoped graph and offers a role view only when requirements are included (OI-22)', async () => {
  const user = userEvent.setup()
  render(<GraphVisualization candidateId="CAND-001" />)
  const svg = await screen.findByLabelText('Candidate knowledge graph')
  expect(api.getCandidateGraph).toHaveBeenCalledWith('CAND-001', 'JOB-001', expect.any(AbortSignal))
  expect(screen.getByText(/relate to Platform Engineer/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Role fit' }))
  expect(within(svg).getByLabelText('Requirement: Python services')).toBeVisible()
  expect(within(svg).getByLabelText('Skill: Python')).toBeVisible()
  expect(within(svg).queryByLabelText('Skill: Go')).not.toBeInTheDocument()
  // Job nodes are not presented as actionable buttons.
  const job = within(svg).getByLabelText('Job: Platform Engineer')
  expect(job).not.toHaveAttribute('tabindex')
  expect(job).toHaveAttribute('role', 'img')
})

it('does not claim a role-specific graph before the job overlay exists', async () => {
  vi.mocked(api.getCandidateGraph).mockResolvedValue({ ...base, job_scope: { job_id: 'JOB-001', title: 'Platform Engineer', status: 'context_building' } })
  render(<GraphVisualization candidateId="CAND-001" />)
  expect(await screen.findByText(/Platform Engineer requirements will appear here when the candidate analysis finishes/)).toBeVisible()
  expect(screen.queryByText(/relate to Platform Engineer/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Role fit' })).not.toBeInTheDocument()
})

it('view modes show different node sets', async () => {
  const user = userEvent.setup()
  render(<GraphVisualization candidateId="CAND-001" />)
  const svg = await screen.findByLabelText('Candidate knowledge graph')
  await user.click(screen.getByRole('button', { name: 'Sources' }))
  expect(within(svg).getByLabelText('Source: GitHub')).toBeVisible()
  expect(within(svg).queryByLabelText('Skill: Kafka')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Projects' }))
  expect(within(svg).getByLabelText('Project: octo/widgets')).toBeVisible()
  expect(within(svg).getByLabelText('Skill: Python')).toBeVisible()
  expect(within(svg).queryByLabelText('Skill: Kafka')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Skills' }))
  expect(within(svg).queryByLabelText('Project: octo/widgets')).not.toBeInTheDocument()
  expect(within(svg).getByLabelText('Skill: Kafka')).toBeVisible()
})

it('a slow response for an earlier skill does not replace the newer selection (OI-23)', async () => {
  const user = userEvent.setup()
  const python = deferred<GraphNode[]>()
  const go = deferred<GraphNode[]>()
  vi.mocked(api.getGraphEvidence).mockImplementation((_id, skill) => skill === 'Python' ? python.promise : go.promise)
  render(<GraphVisualization candidateId="CAND-001" />)
  const svg = await screen.findByLabelText('Candidate knowledge graph')
  await user.click(within(svg).getByLabelText('Skill: Python'))
  const [, , pythonSignal] = vi.mocked(api.getGraphEvidence).mock.calls[0]
  await user.click(within(svg).getByLabelText('Skill: Go'))
  expect(pythonSignal?.aborted).toBe(true)
  const panel = screen.getByRole('complementary', { name: 'Graph details' })
  // Loading is not presented as "nothing found".
  expect(within(panel).getByText('Loading linked observations…')).toBeVisible()
  await act(async () => { go.resolve([project('go-tools')]) })
  await act(async () => { python.resolve([project('py-lib')]) })
  expect(within(panel).getByText('Evidence for Go')).toBeVisible()
  expect(within(panel).getByText('go-tools')).toBeVisible()
  expect(within(panel).queryByText('py-lib')).not.toBeInTheDocument()
})

it('closing the panel discards an in-flight skill response', async () => {
  const user = userEvent.setup()
  const python = deferred<GraphNode[]>()
  vi.mocked(api.getGraphEvidence).mockReturnValue(python.promise)
  render(<GraphVisualization candidateId="CAND-001" />)
  const svg = await screen.findByLabelText('Candidate knowledge graph')
  await user.click(within(svg).getByLabelText('Skill: Python'))
  await user.click(screen.getByRole('button', { name: 'Close details' }))
  await act(async () => { python.resolve([project('py-lib')]) })
  expect(screen.queryByRole('complementary', { name: 'Graph details' })).not.toBeInTheDocument()
  expect(screen.queryByText('py-lib')).not.toBeInTheDocument()
})

it('changing candidate cancels the pending skill request', async () => {
  const user = userEvent.setup()
  vi.mocked(api.getGraphEvidence).mockReturnValue(new Promise(() => {}))
  const { rerender } = render(<GraphVisualization candidateId="CAND-001" />)
  const svg = await screen.findByLabelText('Candidate knowledge graph')
  await user.click(within(svg).getByLabelText('Skill: Python'))
  const [, , signal] = vi.mocked(api.getGraphEvidence).mock.calls[0]
  rerender(<GraphVisualization candidateId="CAND-002" />)
  expect(signal?.aborted).toBe(true)
  expect(screen.queryByRole('complementary', { name: 'Graph details' })).not.toBeInTheDocument()
})

it('skill errors stay in the panel with a retry, leaving the graph visible', async () => {
  const user = userEvent.setup()
  vi.mocked(api.getGraphEvidence).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([project('py-lib')])
  render(<GraphVisualization candidateId="CAND-001" />)
  const svg = await screen.findByLabelText('Candidate knowledge graph')
  await user.click(within(svg).getByLabelText('Skill: Python'))
  const panel = screen.getByRole('complementary', { name: 'Graph details' })
  expect(await within(panel).findByRole('alert')).toHaveTextContent('Could not load evidence for this skill.')
  expect(screen.getByLabelText('Candidate knowledge graph')).toBeVisible()
  await user.click(within(panel).getByRole('button', { name: 'Retry' }))
  expect(await within(panel).findByText('Observation for py-lib')).toBeVisible()
})

it('project and requirement nodes open their details (OI-21/22)', async () => {
  const user = userEvent.setup()
  render(<GraphVisualization candidateId="CAND-001" />)
  const svg = await screen.findByLabelText('Candidate knowledge graph')
  await user.click(within(svg).getByLabelText('Project: octo/widgets'))
  let panel = screen.getByRole('complementary', { name: 'Graph details' })
  expect(within(panel).getByText(/Listing does not establish authorship/)).toBeVisible()
  expect(within(panel).getByText('Indicates: Python')).toBeVisible()
  await user.click(within(svg).getByLabelText('Requirement: Python services'))
  panel = screen.getByRole('complementary', { name: 'Graph details' })
  expect(within(panel).getByText('Matched')).toBeVisible()
  expect(within(panel).getByText('Supported by: Python')).toBeVisible()
  expect(api.getGraphEvidence).not.toHaveBeenCalled()
})

it('without a selected job the graph is candidate-only', async () => {
  selectedJob = null
  vi.mocked(api.getCandidateGraph).mockResolvedValue(base)
  render(<GraphVisualization candidateId="CAND-001" />)
  await screen.findByLabelText('Candidate knowledge graph')
  expect(api.getCandidateGraph).toHaveBeenCalledWith('CAND-001', null, expect.any(AbortSignal))
  expect(screen.getByText(/resume claims, signal sources and public projects connect/)).toBeVisible()
})
