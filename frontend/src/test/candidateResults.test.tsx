import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CandidateResultsView } from '@/components/dashboard/CandidateResultsView'
import { api } from '@/services/api'
import type { RankedCandidate } from '@/types/matching'

const openCandidateDetail = vi.fn()
const refreshJob = vi.fn()
const selectedJob = { id: 'JOB-1', title: 'Backend Engineer', status: 'active' }
vi.mock('@/context/JobContext', () => ({useJob: () => ({selectedJob, searchQuery:'', selectedSkill:'', setSelectedSkill:vi.fn(), openCandidateDetail, setActiveView:vi.fn(), refreshJob})}))
vi.mock('@/context/AuthContext', () => ({useAuth: () => ({hasRole: () => true})}))
vi.mock('@/services/api', async () => {
  const actual = await vi.importActual<typeof import('@/services/api')>('@/services/api')
  return { ApiError: actual.ApiError, api: {getCandidates:vi.fn(), rankCandidates:vi.fn(), extractRequirements:vi.fn(), getJobCandidates:vi.fn(), addJobCandidate:vi.fn(), removeJobCandidate:vi.fn()} }
})
const row: RankedCandidate = {candidate_id:'C-1', full_name:'Maya Chen', headline:'Backend Engineer', resume_fit:.9, evidence_strength:.8, final_score:.85, evidence_label:'Good', context_status:'ready', coverage_counts:{matched:1,partially_supported:0,insufficient_evidence:0,not_assessed:0},coverage:[{requirement_id:'R-1',coverage_state:'matched',claim_ids:[],evidence_record_ids:[],coverage_weight:1,evidence_strength:.8,observation:'Supported'}]}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.getCandidates).mockResolvedValue([
    {id:'C-1',full_name:'Maya Chen',email:'maya@example.com',headline:'Backend Engineer',location:'Berlin',top_skills:['Python','FastAPI']},
    {id:'C-2',full_name:'Omar Diaz',email:'omar@example.com',headline:'Data Engineer',location:'Lisbon',top_skills:['SQL']},
  ])
  vi.mocked(api.rankCandidates).mockResolvedValue([row])
  vi.mocked(api.getJobCandidates).mockResolvedValue([{candidate_id:'C-1',added_at:'2026-11-27T10:00:00Z',source:'upload',context_status:'ready'}])
  vi.mocked(api.extractRequirements).mockResolvedValue([{id:'R-1',requirement_text:'Python',normalized_text:'python',category:'Backend',is_mandatory:true,skill_aliases:[]}])
})
it('maps assessed rankings to the table and applies numeric fit filters', async () => {
  const user = userEvent.setup();render(<CandidateResultsView />)
  expect(await screen.findByText('Maya Chen')).toBeVisible()
  expect(screen.getByText('1/1')).toBeVisible()
  expect(screen.getByText('85')).toBeVisible()
  expect(screen.getByText('Unavailable')).toBeVisible()
  await user.click(screen.getByRole('button',{name:'View Intelligence for Maya Chen'}))
  expect(openCandidateDetail).toHaveBeenCalledWith('C-1')
  await user.selectOptions(screen.getByLabelText('Minimum job fit'),'90')
  expect(screen.queryByText('Maya Chen')).not.toBeInTheDocument()
  expect(screen.getByText('0 of 1 shown')).toBeVisible()
})
it('retains candidate access without presenting scores when ranking fails', async () => {
  vi.mocked(api.rankCandidates).mockRejectedValue(new Error('offline'))
  render(<CandidateResultsView />)
  expect(await screen.findByText('Maya Chen')).toBeVisible()
  expect(screen.getByRole('alert')).toHaveTextContent('Job rankings could not be loaded')
  expect(screen.queryByText('85')).not.toBeInTheDocument()
  expect(screen.getByText('Not assessed')).toBeVisible()
})
it('shows only candidates added to the job and ranks that set (OI-30)', async () => {
  render(<CandidateResultsView />)
  expect(await screen.findByText('Maya Chen')).toBeVisible()
  expect(screen.queryByText('Omar Diaz')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'This job (1)'})).toHaveAttribute('aria-pressed','true')
  expect(api.rankCandidates).toHaveBeenCalledWith({job_id:'JOB-1',scope:'applicants'})
})
it('adds a pool candidate to the job and refreshes its counts', async () => {
  const user = userEvent.setup()
  vi.mocked(api.addJobCandidate).mockResolvedValue({candidate_id:'C-2',added_at:'2026-11-27T11:00:00Z',source:'manual'})
  render(<CandidateResultsView />)
  await screen.findByText('Maya Chen')
  await user.click(screen.getByRole('button',{name:'All candidates'}))
  await waitFor(() => expect(api.rankCandidates).toHaveBeenCalledWith({job_id:'JOB-1'}))
  expect(await screen.findByText('Omar Diaz')).toBeVisible()
  expect(screen.getByRole('button',{name:'Remove Maya Chen from this job'})).toBeVisible()
  vi.mocked(api.getJobCandidates).mockResolvedValue([{candidate_id:'C-1',added_at:'x',source:'upload'},{candidate_id:'C-2',added_at:'y',source:'manual'}])
  await user.click(screen.getByRole('button',{name:'Add Omar Diaz to this job'}))
  expect(api.addJobCandidate).toHaveBeenCalledWith('JOB-1','C-2')
  expect(refreshJob).toHaveBeenCalledWith('JOB-1')
  expect(await screen.findByRole('button',{name:'Remove Omar Diaz from this job'})).toBeVisible()
})
it('explains an empty job instead of showing the whole pool', async () => {
  vi.mocked(api.getJobCandidates).mockResolvedValue([])
  render(<CandidateResultsView />)
  expect(await screen.findByText('No candidates have been added to this job yet.')).toBeVisible()
  expect(screen.queryByText('Maya Chen')).not.toBeInTheDocument()
})
