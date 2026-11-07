import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { ProfileAvatar } from '@/components/layout/ProfileAvatar'
import type { CandidateContext } from '@/types/context'
import type { CandidateSummary } from '@/types'
import type { MatchResponse } from '@/types/matching'
import { useJob } from '@/context/JobContext'
import { useAuth } from '@/context/AuthContext'
export function CandidateComparisonView({ onBack }: { onBack?: () => void }) {
  const { selectedJob, selectedCandidateId, openCandidateDetail, setActiveView } = useJob()
  const { hasRole } = useAuth()
  const canCompare = hasRole('recruiter')
  const [candidates, setCandidates] = useState<CandidateSummary[]>([])
  const [ids, setIds] = useState<string[]>(selectedCandidateId ? [selectedCandidateId] : [])
  const [matchState, setMatchState] = useState<{ key: string; results: Record<string, MatchResponse> }>({ key: '', results: {} })
  const [pickerOpen, setPickerOpen] = useState(false)
  const [contexts, setContexts] = useState<Record<string, CandidateContext>>({})
  const [listLoading, setListLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${selectedJob?.id}:${ids.join(',')}:${attempt}`
  const results = matchState.key === requestKey ? matchState.results : {}
  useEffect(() => { let live = true; api.getCandidates().then(rows => { if(live) setCandidates(rows) }).catch(() => { if(live) setError('Could not load candidates.') }).finally(() => { if(live) setListLoading(false) }); return () => { live = false } }, [])
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
  useEffect(() => {
    let live = true
    if (canCompare) void Promise.allSettled(ids.map(async id => {
      const context = await api.getCandidateContext(id)
      if (live && !('status' in context)) setContexts(previous => ({ ...previous, [id]: context }))
    }))
    return () => { live = false }
  }, [ids, canCompare, attempt])
  if (!canCompare) return <section className="panel"><h1>Candidate Comparison</h1><p>Role-fit comparison requires recruiter access. Interview questions and candidate profiles remain available.</p></section>
  const skills = [...new Set(ids.flatMap(id => candidates.find(candidate => candidate.id === id)?.top_skills ?? []))]
  const readyMatch = (id: string) => { const result = results[id]; return result && !('status' in result) ? result : null }
  const rows = [
    { label: 'Job Fit', values: ids.map(id => readyMatch(id) ? `${Math.round(readyMatch(id)!.final_score * 100)} / 100` : results[id] && 'status' in results[id] ? results[id].status === 'failed' ? 'Assessment unavailable' : 'Building assessment' : selectedJob ? 'Loading...' : 'Select a job') },
    { label: 'Mandatory Skills', values: ids.map(id => {
      const match = readyMatch(id)
      const mandatory = selectedJob?.requirements?.filter(requirement => requirement.is_mandatory) ?? []
      return match && mandatory.length ? `${mandatory.filter(requirement => match.coverage.some(item => item.requirement_id === requirement.id && item.coverage_state === 'matched')).length} / ${mandatory.length}` : 'Not assessed'
    }) },
    { label: 'Evidence Strength', values: ids.map(id => readyMatch(id) ? `${Math.round(readyMatch(id)!.evidence_strength * 100)}%` : 'Pending') },
    ...skills.map(skill => ({ label: skill, values: ids.map(id => {
      const context = contexts[id]
      if (!context) return 'Evidence pending'
      const evidence = context.evidence_records.filter(record => record.skill.toLowerCase() === skill.toLowerCase())
      if (evidence.length) return `Demonstrated ? ${evidence.length} observation${evidence.length === 1 ? '' : 's'}`
      return candidates.find(candidate => candidate.id === id)?.top_skills.some(item => item.toLowerCase() === skill.toLowerCase()) ? 'Unverified ? reported skill' : 'Not reported'
    }) })),
    { label: 'Top Project', values: ids.map(id => contexts[id]?.evidence_records.find(record => record.source_type === 'github' || record.source_type === 'project_submission')?.observation ?? 'No project evidence available') },
    { label: 'Experience', values: ids.map(id => contexts[id]?.candidate.experience_years != null ? `${contexts[id].candidate.experience_years} yrs ? reported` : 'Not available') },
  ]
  return <section className="candidate-comparison">
    <nav aria-label="Breadcrumb" className="comparison-breadcrumb"><button onClick={() => setActiveView('jobs')}>Jobs</button><span>/</span><button onClick={() => setActiveView('job-detail')}>{selectedJob?.title ?? 'Select a job'}</button><span>/</span><span>Comparison</span></nav>
    <div className="comparison-heading"><div><h1>Candidate Comparison</h1><p>Side-by-side evidence for {selectedJob?.title ?? 'the selected job'}. Differences highlighted in gold.</p></div><button className="secondary-button" onClick={() => setPickerOpen(value => !value)} aria-expanded={pickerOpen} aria-controls="comparison-picker"><span aria-hidden="true">?</span> Add candidate</button></div>
    {onBack && <button className="comparison-back" onClick={onBack}>Back to job</button>}
    {pickerOpen && <fieldset id="comparison-picker" className="panel comparison-picker"><legend>Comparison candidates ? select up to 3</legend>{listLoading && <p role="status">Loading candidates...</p>}{!listLoading && !candidates.length && <p>No candidates available.</p>}{candidates.map(candidate => <label key={candidate.id}><input type="checkbox" checked={ids.includes(candidate.id)} disabled={!ids.includes(candidate.id) && ids.length >= 3} onChange={event => setIds(previous => event.target.checked ? [...previous, candidate.id] : previous.filter(id => id !== candidate.id))}/>{candidate.full_name}</label>)}<button className="secondary-button" onClick={() => setPickerOpen(false)}>Done</button></fieldset>}
    {error && <div role="alert" className="panel">{error}<button className="secondary-button" onClick={() => setAttempt(value => value + 1)}>Retry comparison</button></div>}
    {!selectedJob && <p>Select a job to compare role fit.</p>}
    {!ids.length ? <div className="panel comparison-empty"><h2>Select candidates to compare</h2><p>Add up to three candidates to review their skills and evidence side by side.</p><button className="primary-button" onClick={() => setPickerOpen(true)}>Add candidates</button></div> : <div className="comparison-scroll comparison-frame"><table className="comparison-table intelligence-comparison-table"><caption className="sr-only">Role-specific assessment for {selectedJob?.title ?? 'the selected job'}</caption><thead><tr><th scope="col"><span>{ids.length} selected ? max 3</span></th>{ids.map(id => {
      const candidate = candidates.find(item => item.id === id)
      const name = candidate?.full_name ?? id
      return <th scope="col" key={id}><div className="comparison-person"><ProfileAvatar name={name}/><div><strong>{name}</strong><small>{candidate?.headline ?? 'Candidate'}</small></div><span className="comparison-score">{readyMatch(id) ? Math.round(readyMatch(id)!.final_score * 100) : '?'}</span><button className="comparison-remove" onClick={() => setIds(previous => previous.filter(item => item !== id))} aria-label={`Remove ${name}`}>?</button></div></th>
    })}</tr></thead><tbody>{rows.map(row => {
      const different = ids.length > 1 && new Set(row.values).size > 1
      return <tr key={row.label} className={different ? 'comparison-difference' : ''}><th scope="row">{different && <span className="comparison-dot" aria-label="Values differ"/>}{row.label}</th>{row.values.map((value, index) => <td key={ids[index]}>{value}</td>)}</tr>
    })}</tbody><tfoot><tr><td/>{ids.map((id, index) => { const name = candidates.find(candidate => candidate.id === id)?.full_name.split(' ')[0] ?? 'Candidate'; return <td key={id}><button className={index === 0 ? 'primary-button' : 'secondary-button'} onClick={() => openCandidateDetail(id)}>View {name}?s Intelligence</button></td> })}</tr></tfoot></table></div>}
    <p className="comparison-note">Unverified means supporting public evidence is unavailable. Missing evidence does not imply a lack of competence.</p>
  </section>
}
