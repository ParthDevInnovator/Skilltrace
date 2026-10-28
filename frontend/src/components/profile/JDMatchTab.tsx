import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import type { CandidateContext } from '@/types'
import type { ExtractedRequirement, MatchResponse } from '@/types/matching'
export function JDMatchTab({candidateId,jobId,context}:{candidateId:string;jobId:string;context:CandidateContext|null}) {
  const [result,setResult] = useState<MatchResponse|null>(null)
  const [requirements,setRequirements] = useState<ExtractedRequirement[]>([])
  const [attempt,setAttempt] = useState(0)
  const [exhausted,setExhausted] = useState(false)
  useEffect(()=>{
    let cancelled=false, timer:ReturnType<typeof setTimeout>, count=0
    // oxlint-disable-next-line react/set-state-in-effect -- Reset before fetching a new match or retry.
    setResult(null); setExhausted(false)
    async function load() {
      try {
        const [match,reqs] = await Promise.all([api.getCandidateJdMatch(candidateId,{job_id:jobId}),api.extractRequirements({job_id:jobId})])
        if(cancelled) return
        setResult(match); setRequirements(reqs)
        if('status' in match && match.status==='building') { if(++count<10) timer=setTimeout(load,3000); else setExhausted(true) }
      } catch { if(!cancelled) setResult({status:'failed',error:'Could not load match.'}) }
    }
    void load()
    return ()=>{cancelled=true;clearTimeout(timer)}
  },[candidateId,jobId,attempt])
  const retry=<button onClick={()=>setAttempt(n=>n+1)}>Retry match</button>
  if(!result || ('status' in result && result.status==='building')) return <section className="panel" role="status"><div className="animate-pulse">Candidate context is still building. Match will be available once ready.</div>{exhausted && retry}</section>
  if('status' in result) return <section className="panel" role="alert"><p>{result.error}</p>{retry}</section>
  return <section className="page-stack" aria-label="JD Match"><div className="panel match-scores"><strong>Resume Fit {Math.round(result.resume_fit*100)}%</strong><strong>Evidence Strength {Math.round(result.evidence_strength*100)}%</strong><strong>Final Score {Math.round(result.final_score*100)}%</strong></div>{result.coverage.map(c=>{
    const requirement=requirements.find(r=>r.id===c.requirement_id)
    return <article className="panel" key={c.requirement_id}><h3>{requirement?.requirement_text || c.requirement_id}</h3><div className="skill-list"><span className={`requirement-chip ${requirement?.is_mandatory ? 'mandatory':'preferred'}`}>{requirement?.is_mandatory ? 'Mandatory':'Preferred'}</span><span className={`coverage-state ${c.coverage_state}`}>{c.coverage_state.replaceAll('_',' ')}</span></div><p>{c.observation}</p><details><summary>Supporting claims and evidence</summary>{!context && <p>Candidate context is loading.</p>}{context?.claims.filter(claim=>c.claim_ids.includes(claim.id)).map(claim=><p key={claim.id}>{claim.claim_text}</p>)}{context?.evidence_records.filter(record=>c.evidence_record_ids.includes(record.id)).map(record=><p key={record.id}>{record.observation}</p>)}{!c.claim_ids.length && !c.evidence_record_ids.length && <p>No matching claims or evidence.</p>}</details></article>
  })}</section>
}
