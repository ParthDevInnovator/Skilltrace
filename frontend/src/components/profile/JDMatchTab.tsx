import { useJdMatch } from '@/hooks/useJdMatch'
import type { CandidateContext } from '@/types'
export function JDMatchTab({candidateId,jobId,context}:{candidateId:string;jobId:string;context:CandidateContext|null}) {
  const { result, requirements, exhausted, retry: reload } = useJdMatch(candidateId, jobId)
  const retry=<button onClick={reload}>Retry match</button>
  if(!result || ('status' in result && result.status==='building')) return <section className="panel" role="status"><div className="animate-pulse">Candidate context is still building. Match will be available once ready.</div>{exhausted && retry}</section>
  if('status' in result) return <section className="panel" role="alert"><p>{result.error}</p>{retry}</section>
  return <section className="page-stack" aria-label="JD Match"><div className="panel match-scores"><strong>Resume Fit {Math.round(result.resume_fit*100)}%</strong><strong>Evidence Strength {Math.round(result.evidence_strength*100)}%</strong><strong>Final Score {Math.round(result.final_score*100)}%</strong></div>{result.coverage.map(c=>{
    const requirement=requirements.find(r=>r.id===c.requirement_id)
    return <article className="panel" key={c.requirement_id}><h3>{requirement?.requirement_text || c.requirement_id}</h3><div className="skill-list"><span className={`requirement-chip ${requirement?.is_mandatory ? 'mandatory':'preferred'}`}>{requirement?.is_mandatory ? 'Mandatory':'Preferred'}</span><span className={`coverage-state ${c.coverage_state}`}>{c.coverage_state.replaceAll('_',' ')}</span></div><p>{c.observation}</p><details><summary>Supporting claims and evidence</summary>{!context && <p>Candidate context is loading.</p>}{context?.claims.filter(claim=>c.claim_ids.includes(claim.id)).map(claim=><p key={claim.id}>{claim.claim_text}</p>)}{context?.evidence_records.filter(record=>c.evidence_record_ids.includes(record.id)).map(record=><p key={record.id}>{record.observation}</p>)}{!c.claim_ids.length && !c.evidence_record_ids.length && <p>No matching claims or evidence.</p>}</details></article>
  })}</section>
}
