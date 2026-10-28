import { useEffect, useRef, useState } from 'react'
import type { CandidateBrief, InterviewQuestionSet } from '@/types'
import { api } from '@/services/api'

const sections = [['strengths','Strengths'],['evidence_summary','Evidence Summary'],['application_history_notes','Application History Notes'],['identified_gaps','Identified Gaps']] as const
export function formatBrief(brief: CandidateBrief) { return sections.map(([field,title])=>`${title}\n${brief[field]}`).join('\n\n') }
export function downloadBrief(brief: CandidateBrief) {
  const url = URL.createObjectURL(new Blob([formatBrief(brief)], {type:'text/plain;charset=utf-8'}))
  const anchor = document.createElement('a'); anchor.href=url; anchor.download=`${brief.candidate_id}-brief.txt`
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(()=>URL.revokeObjectURL(url), 1000)
}

export function BriefQuestionsTab({candidateId,jobId,exportRequest=0}: {candidateId:string;jobId?:string;exportRequest?:number}) {
  const [view,setView] = useState<'brief'|'questions'>('brief')
  const [brief,setBrief] = useState<CandidateBrief|null>(null)
  const [questions,setQuestions] = useState<InterviewQuestionSet|null>(null)
  const [busy,setBusy] = useState(false)
  const [notice,setNotice] = useState('')
  const [error,setError] = useState(false)
  const [copyStatus,setCopyStatus] = useState('')
  const handledExport = useRef(0)
  const live = useRef(true)
  const inFlight = useRef(false)
  useEffect(()=>{live.current=true;return()=>{live.current=false}},[])
  async function generate(kind:'brief'|'questions', download=false) {
    if(inFlight.current || kind==='questions'&&!jobId) return
    inFlight.current=true;setBusy(true);setNotice('');setError(false)
    try {
      const result = kind==='brief' ? await api.generateBrief(candidateId,{job_id:jobId}) : await api.generateInterviewQuestions(candidateId,{job_id:jobId!})
      if(!live.current)return
      if('status' in result) {
        setNotice(result.status==='building' ? `Candidate context is still building. ${kind==='brief'?'Brief':'Questions'} will be available once context is ready.` : result.error || 'AI providers unavailable. Please retry.')
        setError(result.status==='failed')
      } else if(kind==='brief') { setBrief(result as CandidateBrief); if(download)downloadBrief(result as CandidateBrief) }
      else setQuestions(result as InterviewQuestionSet)
    } catch { if(live.current){setNotice('Could not generate content. Please retry.');setError(true)} }
    finally {inFlight.current=false;if(live.current)setBusy(false)}
  }
  useEffect(()=>{
    if(exportRequest && exportRequest!==handledExport.current){
      handledExport.current=exportRequest;setView('brief')
      if(brief)downloadBrief(brief);else void generate('brief',true)
    }
  },[exportRequest]) // Each export action is consumed once; current brief is retained while mounted.
  async function copy(text:string) { try{await navigator.clipboard.writeText(text);setCopyStatus('Copied to clipboard.')}catch{setCopyStatus('Clipboard unavailable. Use Download as TXT for the brief.')} }
  return <section className="page-stack" aria-label="Brief and questions">
    <div className="profile-tabs" aria-label="Deliverable type"><button aria-pressed={view==='brief'} disabled={busy} onClick={()=>{setView('brief');setNotice('')}}>Executive Brief</button><button aria-pressed={view==='questions'} disabled={busy} onClick={()=>{setView('questions');setNotice('')}}>Interview Questions</button></div>
    {busy && <div role="status" className="generation-skeleton">Generating {view==='brief'?'executive brief':'interview questions'}…</div>}
    {notice && <div role={error?'alert':'status'} className="panel"><p>{notice}</p><button disabled={busy} onClick={()=>generate(view)}>Retry generation</button></div>}
    {copyStatus && <p role="status">{copyStatus}</p>}
    {view==='brief' ? <>
      <div className="modal-actions"><button className="primary-button" disabled={busy} onClick={()=>generate('brief')}>{brief?'Regenerate':'Generate Brief'}</button>{brief && <><button onClick={()=>copy(formatBrief(brief))}>Copy to Clipboard</button><button onClick={()=>downloadBrief(brief)}>Download as TXT</button><span className="provider-badge">{brief.provider_used}</span></>}</div>
      {brief && <>{sections.map(([field,title])=><article className="panel" key={field}><h2>{title}</h2><p className="preserve-text">{brief[field]}</p></article>)}<details><summary>Sources cited</summary>{brief.grounding_ids.map(id=><p key={id}><code className="source-chip">{id}</code></p>)}</details></>}
    </> : !jobId ? <p>Select a job to generate targeted questions.</p> : <>
      <div className="modal-actions"><button className="primary-button" disabled={busy} onClick={()=>generate('questions')}>{questions?'Regenerate Questions':'Generate Questions'}</button>{questions && <button onClick={()=>copy(questions.questions.map((q,i)=>`${i+1}. ${q.question_text}\n${q.rationale} [${q.source_id}]`).join('\n\n'))}>Copy All Questions</button>}</div>
      {questions && <><span className="provider-badge">{questions.provider_used}</span>{!questions.questions.length && <p>No grounded questions were generated. Try regenerating after reviewing the candidate context.</p>}<ol className="question-list">{questions.questions.map((q,i)=><li className="panel" key={`${q.source_id}-${i}`}><p>{q.question_text}</p><span className={`question-category ${q.target_type}`}>{q.target_type.replaceAll('_',' ')}</span><details><summary>Rationale for question {i+1}</summary><p>{q.rationale}</p><code className="source-chip">{q.source_id}</code></details></li>)}</ol></>}
    </>}
  </section>
}
