import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CandidateResultsView } from '@/components/dashboard/CandidateResultsView'
import { api } from '@/services/api'
import type { RankedCandidate } from '@/types/matching'

const openCandidateDetail = vi.fn()
const selectedJob = { id: 'JOB-1', title: 'Backend Engineer' }
vi.mock('@/context/JobContext', () => ({useJob: () => ({selectedJob, searchQuery:'', selectedSkill:'', setSelectedSkill:vi.fn(), openCandidateDetail, setActiveView:vi.fn()})}))
vi.mock('@/context/AuthContext', () => ({useAuth: () => ({hasRole: () => true})}))
vi.mock('@/services/api', () => ({api: {getCandidates:vi.fn(), rankCandidates:vi.fn(), extractRequirements:vi.fn()}}))
const row: RankedCandidate = {candidate_id:'C-1', full_name:'Maya Chen', headline:'Backend Engineer', resume_fit:.9, evidence_strength:.8, final_score:.85, evidence_label:'Good', context_status:'ready', coverage_counts:{matched:1,partially_supported:0,insufficient_evidence:0,not_assessed:0},coverage:[{requirement_id:'R-1',coverage_state:'matched',claim_ids:[],evidence_record_ids:[],coverage_weight:1,evidence_strength:.8,observation:'Supported'}]}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.getCandidates).mockResolvedValue([{id:'C-1',full_name:'Maya Chen',email:'maya@example.com',headline:'Backend Engineer',location:'Berlin',top_skills:['Python','FastAPI']}])
  vi.mocked(api.rankCandidates).mockResolvedValue([row])
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
