import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import type { CandidateSummary } from '@/types'
import type { MatchResponse } from '@/types/matching'
import { useJob } from '@/context/JobContext'
import { useAuth } from '@/context/AuthContext'
export function CandidateComparisonView({ onBack }: { onBack?: () => void }) {
  const { selectedJob, selectedCandidateId, openCandidateDetail } = useJob()
  const { hasRole } = useAuth()
  const canCompare = hasRole('recruiter')
  const [candidates, setCandidates] = useState<CandidateSummary[]>([])
  const [ids, setIds] = useState<string[]>(selectedCandidateId ? [selectedCandidateId] : [])
  const [matchState, setMatchState] = useState<{ key: string; results: Record<string, MatchResponse> }>({ key: '', results: {} })
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${selectedJob?.id}:${ids.join(',')}:${attempt}`
  const results = matchState.key === requestKey ? matchState.results : {}
  useEffect(() => { let live = true; api.getCandidates().then(rows => { if(live) setCandidates(rows) }).catch(() => { if(live) setError('Could not load candidates.') }); return () => { live = false } }, [])
  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const jobId = selectedJob?.id
    async function load(call = 0) {
      if (!jobId || !ids.length || !canCompare) return
      try {
        const rows = await Promise.all(ids.map(async id => [id, await api.getCandidateJdMatch(id, { job_id: jobId })] as const))
        if (!live) return
        setMatchState({ key: requestKey, results: Object.fromEntries(rows) }); setError('')
        if (call < 9 && rows.some(([,r]) => 'status' in r && r.status === 'building')) timer = setTimeout(() => { void load(call+1) }, 3000)
      } catch { if(live) setError('Could not compare candidates. Retry comparison.') }
    }
    void load()
    return () => { live = false; clearTimeout(timer) }
  }, [selectedJob?.id, ids, requestKey, canCompare])
  if (!canCompare) return <section className="panel"><h1>Candidate Comparison</h1><p>Role-fit comparison requires recruiter access. Interview questions and candidate profiles remain available.</p></section>
  return <section className="page-stack"><h1>Candidate Comparison</h1>{onBack && <button onClick={onBack}>Back to job</button>}<p>Select up to three candidates. Scores assess {selectedJob?.title ?? 'no selected job'}; missing evidence is unknown.</p>{!selectedJob && <p>Select a job to compare role fit.</p>}<fieldset className="panel"><legend>Comparison candidates</legend>{candidates.map(c => <label className="block" key={c.id}><input type="checkbox" checked={ids.includes(c.id)} disabled={!ids.includes(c.id) && ids.length >= 3} onChange={e => setIds(previous => e.target.checked ? [...previous,c.id] : previous.filter(id => id !== c.id))} /> {c.full_name}</label>)}</fieldset>{error && <p role="alert">{error}</p>}<button onClick={() => setAttempt(a => a+1)}>Retry comparison</button>{ids.length > 0 && selectedJob && <div className="comparison-scroll"><table className="comparison-table"><caption>Role-specific assessment for {selectedJob.title}</caption><thead><tr><th scope="col">Assessment</th>{ids.map(id => <th key={id} scope="col">{candidates.find(c => c.id === id)?.full_name ?? id}<button className="block" onClick={() => openCandidateDetail(id)}>View intelligence</button></th>)}</tr></thead><tbody>{['Status','Resume Fit','Evidence Strength','Final Score','Requirement coverage'].map(label => <tr key={label}><th scope="row">{label}</th>{ids.map(id => { const r = results[id]; return <td key={id}>{!r ? 'Loading…' : 'status' in r ? r.status === 'failed' ? 'Context failed — assessment unavailable' : 'Context building — retry if still pending' : label === 'Status' ? 'Ready' : label === 'Requirement coverage' ? r.coverage.map(c => <p key={c.requirement_id}>{selectedJob.requirements?.find(req => req.id === c.requirement_id)?.requirement_text ?? c.requirement_id}: {c.coverage_state.replaceAll('_',' ')}</p>) : `${Math.round(100 * (label === 'Resume Fit' ? r.resume_fit : label === 'Evidence Strength' ? r.evidence_strength : r.final_score))}%`}</td> })}</tr>)}</tbody></table></div>}</section>
}
