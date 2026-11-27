import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JobsView } from '@/components/dashboard/JobsView'
import { api } from '@/services/api'
const state=vi.hoisted(()=>({jobs:[
  {id:'JOB-001',title:'Backend Engineer',department:'Engineering',location:'Remote',description_raw:'Build Python services',status:'active',candidate_counts:{total:3,analyzed:2,processing:1,failed:0},requirements:[{id:'R1',requirement_text:'Kubernetes operations',is_mandatory:true}]},
  {id:'CUSTOM-2',title:'Data Analyst',department:'Data',location:'Berlin',description_raw:'Analyse product data',status:'draft',employment_type:'Contract',candidate_counts:{total:0,analyzed:0,processing:0,failed:0}},
],selectedJob:null,openJobWorkspace:vi.fn(),setSelectedJob:vi.fn(),isLoadingJobs:false,jobError:null}))
vi.mock('@/context/JobContext',()=>({useJob:()=>state}))
vi.mock('@/context/AuthContext',()=>({useAuth:()=>({hasRole:()=>true})}))
vi.mock('@/services/api',()=>({api:{rankCandidates:vi.fn(),getSimilarJobs:vi.fn().mockResolvedValue([])}}))
beforeEach(()=>{vi.mocked(api.rankCandidates).mockRejectedValue(new Error('unavailable'))})

it('shows lifecycle status and per-job counts, and opens the workspace (OI-30, OI-31)',async()=>{
 const user=userEvent.setup()
 render(<JobsView onCreate={vi.fn()}/> )
 expect(screen.getByText('Active',{selector:'.job-status-badge'})).toBeVisible()
 expect(screen.getByText('Draft',{selector:'.job-status-badge'})).toBeVisible()
 expect(screen.getByLabelText('Candidates: 3')).toBeVisible()
 expect(screen.getByLabelText('Processing: 1')).toBeVisible()
 expect(screen.getByText('No candidates yet')).toBeVisible()
 expect(screen.getByText(/Data · Berlin · Contract/)).toBeVisible()
 expect(api.rankCandidates).toHaveBeenCalledWith({job_id:'JOB-001',scope:'applicants'})
 await user.click(screen.getAllByRole('button',{name:'Open workspace'})[0])
 expect(state.openJobWorkspace).toHaveBeenCalledWith(state.jobs[0])
})

it('filters by real status counts and searches job IDs and requirements',async()=>{
 const user=userEvent.setup()
 render(<JobsView onCreate={vi.fn()}/> )
 await user.click(screen.getByRole('button',{name:'Draft (1)'}))
 expect(screen.queryByRole('heading',{name:'Backend Engineer'})).not.toBeInTheDocument()
 expect(screen.getByRole('heading',{name:'Data Analyst'})).toBeVisible()
 await user.click(screen.getByRole('button',{name:'Closed (0)'}))
 expect(screen.getByText('No jobs match your filters.')).toBeVisible()
 await user.click(screen.getByRole('button',{name:'All (2)'}))
 await user.type(screen.getByLabelText('Search jobs'),'job-001')
 expect(screen.getByRole('heading',{name:'Backend Engineer'})).toBeVisible()
 expect(screen.queryByRole('heading',{name:'Data Analyst'})).not.toBeInTheDocument()
 await user.clear(screen.getByLabelText('Search jobs'))
 await user.type(screen.getByLabelText('Search jobs'),'kubernetes')
 expect(screen.getByRole('heading',{name:'Backend Engineer'})).toBeVisible()
 await user.clear(screen.getByLabelText('Search jobs'))
 await user.type(screen.getByLabelText('Search jobs'),'Designer')
 expect(screen.getByText('No jobs match your filters.')).toBeVisible()
})
