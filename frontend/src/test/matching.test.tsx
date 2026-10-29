import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@/App'
import { api } from '@/services/api'
import { JDMatchTab } from '@/components/profile/JDMatchTab'
import { exampleContext } from './evidenceFixtures'
import type { ExtractedRequirement, RankedCandidate, CandidateMatchResult } from '@/types/matching'
vi.mock('@/services/api',()=>({api:{getJobs:vi.fn(),getCandidates:vi.fn(),getCandidateById:vi.fn(),getCandidateContext:vi.fn(),extractRequirements:vi.fn(),rankCandidates:vi.fn(),getCandidateJdMatch:vi.fn(),createJob:vi.fn(),getSimilarJobs:vi.fn()}}))
const requirements:ExtractedRequirement[]=[{id:'r1',requirement_text:'Python services',normalized_text:'python services',category:'Backend',is_mandatory:true,skill_aliases:['Python']},{id:'r2',requirement_text:'React interfaces',normalized_text:'react interfaces',category:'Frontend',is_mandatory:false,skill_aliases:['React']}]
const job={id:'J',title:'Engineer role',department:'Engineering',location:'Remote',description_raw:'Build Python services and React interfaces for customers.',requirements}
const candidates=[exampleContext.candidate,{...exampleContext.candidate,id:'CAND-002',full_name:'Bea Builder'},{...exampleContext.candidate,id:'CAND-003',full_name:'Casey Ready'}]
const cover=(id:string,state:'matched'|'partially_supported'|'not_assessed')=>({requirement_id:id,coverage_state:state,claim_ids:['CLAIM-1'],evidence_record_ids:['OBS-1'],coverage_weight:state==='matched'?1:0,evidence_strength:.4,observation:'Template observation for '+id})
const ranked:RankedCandidate[]=[{candidate_id:'CAND-003',full_name:'Casey Ready',headline:'Engineer',resume_fit:1,evidence_strength:.8,final_score:.9,evidence_label:'Some',context_status:'ready',coverage_counts:{matched:2,partially_supported:0,insufficient_evidence:0,not_assessed:0},coverage:[cover('r1','matched'),cover('r2','matched')]},{candidate_id:'CAND-001',full_name:'Alex Chen',headline:'Engineer',resume_fit:.5,evidence_strength:.3,final_score:.4,evidence_label:'Some',context_status:'ready',coverage_counts:{matched:1,partially_supported:0,insufficient_evidence:0,not_assessed:1},coverage:[cover('r1','matched'),cover('r2','not_assessed')]},{candidate_id:'CAND-002',full_name:'Bea Builder',headline:'Engineer',resume_fit:0,evidence_strength:0,final_score:0,evidence_label:'No public evidence',context_status:'building',coverage_counts:{matched:0,partially_supported:0,insufficient_evidence:0,not_assessed:2},coverage:[cover('r1','not_assessed'),cover('r2','not_assessed')]}]
const match:CandidateMatchResult={candidate_id:'CAND-001',job_id:'J',reference_date:'2026-10-26',result_built_at:'2026-10-26T00:00:00Z',resume_fit:.5,evidence_strength:.3,final_score:.4,coverage:[cover('r1','matched'),cover('r2','not_assessed')]}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(api.getJobs).mockResolvedValue([job]);vi.mocked(api.getCandidates).mockResolvedValue(candidates);vi.mocked(api.getCandidateContext).mockResolvedValue(exampleContext);vi.mocked(api.getCandidateById).mockResolvedValue(exampleContext.candidate);vi.mocked(api.extractRequirements).mockResolvedValue(requirements);vi.mocked(api.rankCandidates).mockResolvedValue(ranked);vi.mocked(api.getCandidateJdMatch).mockResolvedValue(match);vi.mocked(api.createJob).mockImplementation(async body=>({...body,id:'CUSTOM-test',requirements}));vi.mocked(api.getSimilarJobs).mockResolvedValue([])})
afterEach(()=>vi.useRealTimers())
it('ranks, intersects requirement filters, clears them and restores API order',async()=>{
 const user=userEvent.setup();render(<App/>);await screen.findByText('Alex Chen')
 expect(screen.getAllByText('Unassessed')).toHaveLength(3)
 await user.click(screen.getByRole('button',{name:'Rank by fit'}))
 expect(await screen.findByText('Final 90%')).toBeVisible();expect(screen.getByText('Context building')).toBeVisible()
 const names=()=>screen.getAllByText(/^(Alex Chen|Bea Builder|Casey Ready)$/).map(n=>n.textContent)
 expect(names()).toEqual(['Casey Ready','Alex Chen','Bea Builder'])
 const filters=screen.getByLabelText('Filter by requirement')
 await user.click(within(filters).getByRole('button',{name:'Python services'}));expect(names()).toEqual(['Casey Ready','Alex Chen'])
 await user.click(within(filters).getByRole('button',{name:'React interfaces'}));expect(names()).toEqual(['Casey Ready'])
 await user.click(within(filters).getByRole('button',{name:'Clear filters'}));expect(names()).toHaveLength(3)
 await user.click(screen.getByRole('button',{name:'Back to default order'}));expect(names()).toEqual(['Alex Chen','Bea Builder','Casey Ready']);expect(screen.queryByTestId('match-score')).not.toBeInTheDocument()
})
it('clears ranking when the active job is removed',async()=>{
 const user=userEvent.setup();render(<App/>);await screen.findByText('Alex Chen');await user.click(screen.getByRole('button',{name:'Rank by fit'}));await screen.findByText('Final 90%')
 await user.click(screen.getByRole('button',{name:/Engineer role/}));await user.click(screen.getByRole('button',{name:'Clear selection'}));expect(screen.queryByText('Final 90%')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Rank by fit'})).not.toBeInTheDocument()
})
it.each([false,true])('custom extraction chips and fallback (failure=%s)',async(failure)=>{
 if(failure)vi.mocked(api.extractRequirements).mockRejectedValue(new Error('offline'))
 const user=userEvent.setup();render(<App/>);await user.click(screen.getByRole('button',{name:'Create Job'}));await user.type(screen.getByLabelText('Job Title *'),'Custom Developer');await user.type(screen.getByLabelText('Job Description Text *'),'Build Python services for customers. React interfaces are preferred.');await user.click(screen.getByRole('button',{name:'Set as Active Requisition'}));await screen.findByRole('heading',{name:'Custom Developer'})
 if(failure){expect(screen.getByText('Requirements not extracted.')).toBeVisible();expect(screen.getByText('Build Python services for customers. React interfaces are preferred.')).toBeVisible()}
 else {expect(screen.getByText('Python services - Mandatory')).toHaveClass('mandatory');expect(screen.getByText('React interfaces - Preferred')).toHaveClass('preferred')}
})
it('renders coverage colors, scores and expandable context support',async()=>{
 const user=userEvent.setup();render(<JDMatchTab candidateId="CAND-001" jobId="J" context={exampleContext}/>);expect(await screen.findByText('Final Score 40%')).toBeVisible();expect(screen.getByText('matched')).toHaveClass('matched');expect(screen.getByText('not assessed')).toHaveClass('not_assessed');await user.click(screen.getAllByText('Supporting claims and evidence')[0]);expect(screen.getAllByText('Built Python services')[0]).toBeVisible();expect(screen.getAllByText('Synthetic headline mentions Python')[0]).toBeVisible()
})
it('shows failure and retries successfully',async()=>{
 vi.mocked(api.getCandidateJdMatch).mockResolvedValueOnce({status:'failed',error:'Synthetic failure'})
 const user=userEvent.setup();render(<JDMatchTab candidateId="CAND-001" jobId="J" context={exampleContext}/>);expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic failure');await user.click(screen.getByRole('button',{name:'Retry match'}));expect(await screen.findByText('Final Score 40%')).toBeVisible()
})
it('polls building at most ten times, then exposes manual retry and cleans up',async()=>{
 vi.useFakeTimers();vi.mocked(api.getCandidateJdMatch).mockResolvedValue({status:'building'})
 const rendered=render(<JDMatchTab candidateId="CAND-001" jobId="J" context={null}/>);
 await act(async()=>{await Promise.resolve()});expect(screen.getByRole('status')).toHaveTextContent('still building')
 for(let i=0;i<9;i++)await act(async()=>{await vi.advanceTimersByTimeAsync(3000)})
 expect(api.getCandidateJdMatch).toHaveBeenCalledTimes(10);expect(screen.getByRole('button',{name:'Retry match'})).toBeVisible();rendered.unmount();await act(async()=>{await vi.advanceTimersByTimeAsync(6000)});expect(api.getCandidateJdMatch).toHaveBeenCalledTimes(10)
})
it('shows all coverage colors without using evidence label as role fit',async()=>{
 vi.mocked(api.getCandidateJdMatch).mockResolvedValue({...match,coverage:[{...cover('r1','matched'),coverage_state:'partially_supported'},{...cover('r2','matched'),coverage_state:'insufficient_evidence'}]})
 render(<JDMatchTab candidateId="CAND-001" jobId="J" context={exampleContext}/>);await waitFor(()=>expect(screen.getByText('partially supported')).toHaveClass('partially_supported'));expect(screen.getByText('insufficient evidence')).toHaveClass('insufficient_evidence')
})
