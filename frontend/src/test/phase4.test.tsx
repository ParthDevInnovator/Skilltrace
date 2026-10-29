import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatDrawer } from '@/components/agent/ChatDrawer'
import { BriefQuestionsTab, formatBrief } from '@/components/profile/BriefQuestionsTab'
import { GraphVisualization, nodeColors } from '@/components/graph/GraphVisualization'
import { api } from '@/services/api'
import type { CandidateBrief, InterviewQuestionSet } from '@/types'

const openCandidateDetail = vi.fn()
vi.mock('@/context/JobContext', () => ({useJob: () => ({selectedJob:{id:'JOB-001'}, openCandidateDetail})}))
vi.mock('@/services/api', () => ({api:{sendChatMessage:vi.fn(),generateBrief:vi.fn(),generateInterviewQuestions:vi.fn(),getCandidateGraph:vi.fn(),getGraphEvidence:vi.fn()}}))

const brief:CandidateBrief={candidate_id:'CAND-001',job_id:'JOB-001',generated_at:'2026-10-29T00:00:00Z',provider_used:'gemini',strengths:'Strong Python [OBS-1]',evidence_summary:'Repository evidence.',application_history_notes:'No prior applications.',identified_gaps:'Validate CLAIM-1.',grounding_ids:['OBS-1','CLAIM-1']}
const questions:InterviewQuestionSet={candidate_id:'CAND-001',job_id:'JOB-001',generated_at:'2026-10-29T00:00:00Z',provider_used:'groq',grounding_ids:['CLAIM-1','REQ-1','CLAIM-2'],questions:[
 {question_text:'Explain the claim?',target_type:'unverified_claim',source_id:'CLAIM-1',rationale:'Claim remains unverified.'},
 {question_text:'Address the gap?',target_type:'coverage_gap',source_id:'REQ-1',rationale:'Requirement is not assessed.'},
 {question_text:'Discuss the history?',target_type:'history_probe',source_id:'CLAIM-2',rationale:'Prior feedback requires clarification.'},
]}
const graph={nodes:[{id:'CAND-001',label:'Candidate' as const,properties:{name:'Alex'}},{id:'Python',label:'Skill' as const,properties:{name:'Python'}},{id:'repo',label:'Repository' as const,properties:{title:'Repo'}}],edges:[{source_id:'CAND-001',target_id:'Python',relationship:'HAS_SKILL'}]}

beforeEach(()=>{
 vi.resetAllMocks()
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','')}})
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open')}})
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn().mockResolvedValue(undefined)}})
 Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=> 'blob:brief')})
 Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()})
 vi.mocked(api.generateBrief).mockResolvedValue(brief)
 vi.mocked(api.generateInterviewQuestions).mockResolvedValue(questions)
 vi.mocked(api.getCandidateGraph).mockResolvedValue(graph)
 vi.mocked(api.getGraphEvidence).mockResolvedValue([{id:'repo',label:'Repository',properties:{title:'Repo'}}])
})

it('shows a typing indicator while chat is in flight',async()=>{
 let resolve!:(value:any)=>void;vi.mocked(api.sendChatMessage).mockReturnValue(new Promise(r=>{resolve=r}))
 const user=userEvent.setup();render(<ChatDrawer onClose={vi.fn()}/>)
 await user.type(screen.getByLabelText('Message'),'Tell me about Alex');await user.click(screen.getByRole('button',{name:'Send'}))
 expect(screen.getByLabelText('Assistant is typing')).toBeVisible();resolve({assistant_message:'Answer',tool_calls_made:0,provider_used:'gemini',grounding_ids:[]})
 await screen.findByText('Answer')
})
it('renders chat grounding chips and provider badge',async()=>{
 vi.mocked(api.sendChatMessage).mockResolvedValue({assistant_message:'Grounded OBS-1',tool_calls_made:1,provider_used:'gemini',grounding_ids:['OBS-1']})
 const user=userEvent.setup();render(<ChatDrawer onClose={vi.fn()} initialMessage="Question"/>);await user.click(screen.getByRole('button',{name:'Send'}))
 expect(await screen.findByText('OBS-1')).toBeVisible();expect(screen.getByText('Gemini')).toBeVisible()
})
it('accumulates chat history and injects active job',async()=>{
 vi.mocked(api.sendChatMessage).mockResolvedValue({assistant_message:'Answer',tool_calls_made:0,provider_used:'groq',grounding_ids:[]})
 const user=userEvent.setup();render(<ChatDrawer onClose={vi.fn()} initialMessage="First"/>);await user.click(screen.getByRole('button',{name:'Send'}));await screen.findByText('Answer')
 await user.type(screen.getByLabelText('Message'),'Second');await user.click(screen.getByRole('button',{name:'Send'}));await waitFor(()=>expect(api.sendChatMessage).toHaveBeenCalledTimes(2))
 expect(vi.mocked(api.sendChatMessage).mock.calls[1][0]).toMatchObject({job_id:'JOB-001',history:[{role:'user',content:'First'},{role:'assistant',content:'Answer'}]})
})
it('shows chat error and retries',async()=>{
 vi.mocked(api.sendChatMessage).mockRejectedValueOnce(new Error('503')).mockResolvedValueOnce({assistant_message:'Recovered',tool_calls_made:0,provider_used:'groq',grounding_ids:[]})
 const user=userEvent.setup();render(<ChatDrawer onClose={vi.fn()} initialMessage="Question"/>);await user.click(screen.getByRole('button',{name:'Send'}));expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');await user.click(screen.getByRole('button',{name:'Retry message'}));expect(await screen.findByText('Recovered')).toBeVisible()
})
it('submits chat on Enter but preserves Shift Enter',async()=>{
 vi.mocked(api.sendChatMessage).mockResolvedValue({assistant_message:'Answer',tool_calls_made:0,provider_used:'gemini',grounding_ids:[]})
 const user=userEvent.setup();render(<ChatDrawer onClose={vi.fn()}/>);const input=screen.getByLabelText('Message');await user.type(input,'Line{shift>}{enter}{/shift}Two');expect(input).toHaveValue('Line\nTwo');fireEvent.keyDown(input,{key:'Enter'});await waitFor(()=>expect(api.sendChatMessage).toHaveBeenCalledOnce())
})

it('renders all four brief sections and sources',async()=>{
 const user=userEvent.setup();render(<BriefQuestionsTab candidateId="CAND-001" jobId="JOB-001"/>);await user.click(screen.getByRole('button',{name:'Generate Brief'}));for(const title of ['Strengths','Evidence Summary','Application History Notes','Identified Gaps'])expect(await screen.findByRole('heading',{name:title})).toBeVisible();expect(screen.getByText('Sources cited')).toBeVisible()
})
it('shows brief building state without polling',async()=>{
 vi.mocked(api.generateBrief).mockResolvedValue({status:'building'});const user=userEvent.setup();render(<BriefQuestionsTab candidateId="CAND-001"/>);await user.click(screen.getByRole('button',{name:'Generate Brief'}));expect(await screen.findByText(/context is still building/)).toBeVisible();expect(api.generateBrief).toHaveBeenCalledOnce()
})
it('copies the formatted brief',async()=>{
 const user=userEvent.setup();const writeText=vi.fn().mockResolvedValue(undefined);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});render(<BriefQuestionsTab candidateId="CAND-001"/>);await user.click(screen.getByRole('button',{name:'Generate Brief'}));fireEvent.click(await screen.findByRole('button',{name:'Copy to Clipboard'}));await waitFor(()=>expect(writeText).toHaveBeenCalledWith(formatBrief(brief)))
})
it('downloads the brief as text',async()=>{
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});const user=userEvent.setup();render(<BriefQuestionsTab candidateId="CAND-001"/>);await user.click(screen.getByRole('button',{name:'Generate Brief'}));await user.click(await screen.findByRole('button',{name:'Download as TXT'}));expect(URL.createObjectURL).toHaveBeenCalled();expect(click).toHaveBeenCalled();click.mockRestore()
})
it('renders all interview question categories and rationale sources',async()=>{
 const user=userEvent.setup();render(<BriefQuestionsTab candidateId="CAND-001" jobId="JOB-001"/>);await user.click(screen.getByRole('button',{name:'Interview Questions'}));await user.click(screen.getByRole('button',{name:'Generate Questions'}));for(const label of ['unverified claim','coverage gap','history probe'])expect(await screen.findByText(label)).toBeVisible();await user.click(screen.getByText('Rationale for question 1'));expect(screen.getByText('CLAIM-1')).toBeVisible()
})
it('requires an active job for questions',async()=>{
 const user=userEvent.setup();render(<BriefQuestionsTab candidateId="CAND-001"/>);await user.click(screen.getByRole('button',{name:'Interview Questions'}));expect(screen.getByText('Select a job to generate targeted questions.')).toBeVisible()
})

it('renders graph nodes with label colors',async()=>{
 render(<GraphVisualization candidateId="CAND-001"/>);const svg=await screen.findByLabelText('Candidate knowledge graph');expect(within(svg).getByLabelText('Candidate: Alex').querySelector('circle')).toHaveAttribute('fill',nodeColors.Candidate);expect(within(svg).getByLabelText('Skill: Python').querySelector('circle')).toHaveAttribute('fill',nodeColors.Skill)
})
it('shows informative graph unavailable state',async()=>{
 vi.mocked(api.getCandidateGraph).mockResolvedValue({status:'unavailable'});render(<GraphVisualization candidateId="CAND-001"/>);expect(await screen.findByText(/Knowledge graph is not available/)).toBeVisible();expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('asks for candidate selection when graph has no candidate',()=>{
 render(<GraphVisualization/>);expect(screen.getByText('Select a candidate to explore their knowledge graph.')).toBeVisible();expect(api.getCandidateGraph).not.toHaveBeenCalled()
})
it('loads skill evidence and opens candidate nodes',async()=>{
 const user=userEvent.setup();render(<GraphVisualization candidateId="CAND-001"/>);const svg=await screen.findByLabelText('Candidate knowledge graph');await user.click(within(svg).getByLabelText('Skill: Python'));expect((await screen.findAllByText('Repo')).length).toBeGreaterThan(1);expect(api.getGraphEvidence).toHaveBeenCalledWith('CAND-001','Python');await user.click(within(svg).getByLabelText('Candidate: Alex'));expect(openCandidateDetail).toHaveBeenCalledWith('CAND-001')
})
