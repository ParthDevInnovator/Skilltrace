/* oxlint-disable react/only-export-components, react/set-state-in-effect, react-hooks/exhaustive-deps -- formatting helpers are reusable; exportRequest is an edge-triggered command consumed once. */
import { useEffect, useRef, useState } from 'react'
import type { CandidateBrief, InterviewQuestionSet } from '@/types'
import { api, type ExportEvent } from '@/services/api'
import { useAuth } from '@/context/AuthContext'

const sections = [['strengths','Strengths'],['evidence_summary','Evidence Summary'],['application_history_notes','Application History Notes'],['identified_gaps','Identified Gaps']] as const
export interface BriefScope { candidateName?: string; jobTitle?: string; contextRevision?: string }
/** The brief text plus the scope it was generated for, so a downloaded copy says which candidate, job and evidence it covers (OI-17). */
export function formatBrief(brief: CandidateBrief, scope: BriefScope = {}) {
  const named = (name: string | undefined, id: string) => name ? `${name} (${id})` : id
  const header = [
    `Candidate: ${named(scope.candidateName, brief.candidate_id)}`,
    `Job: ${brief.job_id ? named(scope.jobTitle, brief.job_id) : 'none (general brief)'}`,
    `Generated: ${brief.generated_at}`,
    ...(scope.contextRevision ? [`Evidence as of: ${scope.contextRevision}`] : []),
  ].join('\n')
  const body = sections.map(([field,title])=>`${title}\n${brief[field]}`).join('\n\n')
  const sources = brief.grounding_ids.length ? `\n\nSources cited\n${brief.grounding_ids.join('\n')}` : ''
  return `${header}\n\n${body}${sources}`
}
export function downloadBrief(brief: CandidateBrief, scope: BriefScope = {}) {
  const url = URL.createObjectURL(new Blob([formatBrief(brief, scope)], {type:'text/plain;charset=utf-8'}))
  const anchor = document.createElement('a'); anchor.href=url; anchor.download=`${brief.candidate_id}${brief.job_id ? `-${brief.job_id}` : ''}-brief.txt`
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(()=>URL.revokeObjectURL(url), 1000)
}

type Scoped<T> = { scope: string; value: T }
export function BriefQuestionsTab({candidateId,jobId,exportRequest=0,contextRevision,candidateName,jobTitle}: {candidateId:string;jobId?:string;exportRequest?:number;contextRevision?:string;candidateName?:string;jobTitle?:string}) {
  const {hasRole}=useAuth()
  // Generated content belongs to one candidate, job and context revision. Anything produced for an
  // earlier scope is hidden, and late responses for an old scope are dropped (OI-17).
  const scope = `${candidateId}|${jobId ?? ''}|${contextRevision ?? ''}`
  const scopeRef = useRef(scope)
  useEffect(()=>{scopeRef.current=scope},[scope])
  const meta: BriefScope = {candidateName, jobTitle, contextRevision}
  const [view,setView] = useState<'brief'|'questions'>('brief')
  const [briefState,setBrief] = useState<Scoped<CandidateBrief>|null>(null)
  const [questionState,setQuestions] = useState<Scoped<InterviewQuestionSet>|null>(null)
  const [busyScope,setBusy] = useState<string|null>(null)
  const [noticeState,setNotice] = useState<Scoped<{text:string;error:boolean}>|null>(null)
  const current = <T,>(value: Scoped<T>|null) => value?.scope === scope ? value.value : null
  const brief = current(briefState), questions = current(questionState)
  const busy = busyScope === scope
  const notice = current(noticeState)?.text ?? ''
  const error = current(noticeState)?.error ?? false
  const [copyStatus,setCopyStatus] = useState('')
  const handledExport = useRef(0)
  const [exportError,setExportError] = useState('')
  /** Records the export on the server first; if that fails nothing leaves the app (OI-08). */
  async function audited(event:ExportEvent, action:()=>unknown) {
    setExportError('')
    try { await api.recordExport(event) }
    catch { if(live.current) setExportError('This export could not be recorded, so it was not started. Please retry.'); return }
    await action()
  }
  const exportBrief=(value:CandidateBrief)=>audited({kind:'brief',candidate_id:candidateId,job_id:jobId,format:'txt'},()=>downloadBrief(value, meta))
  const live = useRef(true)
  const inFlight = useRef<string|null>(null)
  useEffect(()=>{live.current=true;return()=>{live.current=false}},[])
  async function generate(kind:'brief'|'questions', download=false) {
    const requested = scope
    if(inFlight.current===requested || kind==='questions'&&!jobId) return
    inFlight.current=requested;setBusy(requested);setNotice(null)
    const stale = () => !live.current || scopeRef.current !== requested
    try {
      const result = kind==='brief' ? await api.generateBrief(candidateId,{job_id:jobId}) : await api.generateInterviewQuestions(candidateId,{job_id:jobId!})
      if(stale())return
      if('status' in result) {
        setNotice({scope:requested,value:{text:result.status==='building' ? `Candidate context is still building. ${kind==='brief'?'Brief':'Questions'} will be available once context is ready.` : result.error || 'AI providers unavailable. Please retry.', error:result.status==='failed'}})
      } else if(kind==='brief') { setBrief({scope:requested,value:result as CandidateBrief}); if(download)void exportBrief(result as CandidateBrief) }
      else setQuestions({scope:requested,value:result as InterviewQuestionSet})
    } catch { if(!stale())setNotice({scope:requested,value:{text:'Could not generate content. Please retry.',error:true}}) }
    finally {if(inFlight.current===requested)inFlight.current=null;if(live.current)setBusy(previous=>previous===requested?null:previous)}
  }
  useEffect(()=>{
    if(exportRequest && exportRequest!==handledExport.current){
      handledExport.current=exportRequest;setView('brief')
      if(brief)void exportBrief(brief);else void generate('brief',true)
    }
  },[exportRequest]) // Each export action is consumed once; current brief is retained while mounted.
  async function copy(text:string) { try{await navigator.clipboard.writeText(text);setCopyStatus('Copied to clipboard.')}catch{setCopyStatus('Clipboard unavailable. Use Download as TXT for the brief.')} }
  return <section className="page-stack" aria-label="Brief and questions">
    <div className="profile-tabs" aria-label="Deliverable type"><button aria-pressed={view==='brief'} disabled={busy} onClick={()=>{setView('brief');setNotice(null)}}>Executive Brief</button><button aria-pressed={view==='questions'} disabled={busy} onClick={()=>{setView('questions');setNotice(null)}}>Interview Questions</button></div>
    {busy && <div role="status" className="generation-skeleton">Generating {view==='brief'?'executive brief':'interview questions'}…</div>}
    {notice && <div role={error?'alert':'status'} className="panel"><p>{notice}</p><button disabled={busy} onClick={()=>generate(view)}>Retry generation</button></div>}
    {copyStatus && <p role="status">{copyStatus}</p>}
    {exportError && <p role="alert" className="access-error">{exportError}</p>}
    {view==='brief' ? <>
      <div className="modal-actions">{hasRole('recruiter')&&<button className="primary-button" disabled={busy} onClick={()=>generate('brief')}>{brief?'Regenerate':'Generate Brief'}</button>}{brief && <><button onClick={()=>audited({kind:'brief',candidate_id:candidateId,job_id:jobId,format:'clipboard'},()=>copy(formatBrief(brief, meta)))}>Copy to Clipboard</button><button onClick={()=>exportBrief(brief)}>Download as TXT</button><span className="provider-badge">{brief.provider_used}</span></>}</div>
      {brief && <><p className="brief-scope">For {candidateName ?? candidateId}{brief.job_id ? ` · ${jobTitle ?? brief.job_id}` : ' · general brief'} · generated {new Date(brief.generated_at).toLocaleString()}</p>{sections.map(([field,title])=><article className="panel" key={field}><h2>{title}</h2><p className="preserve-text">{brief[field]}</p></article>)}<details><summary>Sources cited</summary>{brief.grounding_ids.map(id=><p key={id}><code className="source-chip">{id}</code></p>)}</details></>}
    </> : !jobId ? <p>Select a job to generate targeted questions.</p> : <>
      <div className="modal-actions"><button className="primary-button" disabled={busy} onClick={()=>generate('questions')}>{questions?'Regenerate Questions':'Generate Questions'}</button>{questions && <button onClick={()=>audited({kind:'questions',candidate_id:candidateId,job_id:jobId,item_count:questions.questions.length,format:'clipboard'},()=>copy(questions.questions.map((q,i)=>`${i+1}. ${q.question_text}\n${q.rationale} [${q.source_id}]`).join('\n\n')))}>Copy All Questions</button>}</div>
      {questions && <><span className="provider-badge">{questions.provider_used}</span>{!questions.questions.length && <p>No grounded questions were generated. Try regenerating after reviewing the candidate context.</p>}<ol className="question-list">{questions.questions.map((q,i)=><li className="panel" key={`${q.source_id}-${i}`}><p>{q.question_text}</p><span className={`question-category ${q.target_type}`}>{q.target_type.replaceAll('_',' ')}</span><details><summary>Rationale for question {i+1}</summary><p>{q.rationale}</p><code className="source-chip">{q.source_id}</code></details></li>)}</ol></>}
    </>}
  </section>
}
