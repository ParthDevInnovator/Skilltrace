import { useCallback, useEffect, useState } from 'react'
import { api } from '@/services/api'
import { ProfileAvatar } from '@/components/layout/ProfileAvatar'
import type { CandidateContext, BuildInProgress } from '@/types/context'
import type { CandidateSummary } from '@/types'
import type { MatchResponse } from '@/types/matching'
import { MAX_COMPARISON, useJob } from '@/context/JobContext'
import { useAuth } from '@/context/AuthContext'
import { assessSkills, skillStatus } from '@/types/skills'
import { usePolledPerId, type PolledEntry } from '@/hooks/usePolledPerId'

type ContextResponse = CandidateContext | BuildInProgress
const contextPending = (value: ContextResponse) => 'status' in value
const matchPending = (value: MatchResponse) => 'status' in value && value.status === 'building'

function matchLabel(entry: PolledEntry<MatchResponse>, hasJob: boolean) {
  if (!hasJob) return 'Select a job'
  const value = entry.value
  if (entry.phase === 'error') return 'Could not load assessment'
  if (entry.phase === 'exhausted') return 'Still building assessment'
  if (value && !('status' in value)) return `${Math.round(value.final_score * 100)} / 100`
  if (value && value.status === 'failed') return 'Assessment failed'
  return entry.phase === 'pending' ? 'Building assessment' : 'Loading...'
}
function contextLabel(entry: PolledEntry<ContextResponse>) {
  return entry.phase === 'error' ? 'Evidence unavailable' : entry.phase === 'exhausted' ? 'Evidence still building' : entry.phase === 'pending' ? 'Evidence pending' : 'Loading evidence...'
}

export function CandidateComparisonView({ onBack }: { onBack?: () => void }) {
  const { selectedJob, selectedCandidateId, openCandidateDetail, setActiveView, comparisonIds: ids, setComparisonIds: setIds } = useJob()
  const { hasRole } = useAuth()
  const canCompare = hasRole('recruiter')
  const [candidates, setCandidates] = useState<CandidateSummary[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [listAttempt, setListAttempt] = useState(0)
  const jobId = selectedJob?.id ?? ''

  // Seed an empty set with the candidate the user came from; an existing set is kept as is (OI-16).
  useEffect(() => { if (selectedCandidateId) setIds(previous => previous.length ? previous : [selectedCandidateId]) }, [selectedCandidateId, setIds])

  useEffect(() => {
    let live = true
    // oxlint-disable-next-line react/set-state-in-effect -- Show loading again on a retry.
    setListState('loading')
    api.getCandidates().then(rows => { if (live) { setCandidates(rows); setListState('ready') } }).catch(() => { if (live) setListState('error') })
    return () => { live = false }
  }, [listAttempt])

  const fetchMatch = useCallback((id: string) => api.getCandidateJdMatch(id, { job_id: jobId }), [jobId])
  const matches = usePolledPerId<MatchResponse>(ids, jobId, fetchMatch, matchPending, canCompare && !!jobId)
  const contexts = usePolledPerId<ContextResponse>(ids, 'context', api.getCandidateContext, contextPending, canCompare)

  if (!canCompare) return <section className="panel"><h1>Candidate Comparison</h1><p>Role-fit comparison requires recruiter access. Interview questions and candidate profiles remain available.</p></section>
  const contextOf = (id: string) => { const value = contexts.get(id).value; return value && !contextPending(value) ? value as CandidateContext : null }
  const readyMatch = (id: string) => { const value = matches.get(id).value; return value && !('status' in value) ? value : null }
  const reportedOf = (id: string) => candidates.find(candidate => candidate.id === id)?.top_skills ?? []
  const assessed = Object.fromEntries(ids.map(id => [id, assessSkills(reportedOf(id), contextOf(id))]))
  const skills = [...new Map(ids.flatMap(id => assessed[id].filter(skill => skill.reported)).map(skill => [skill.name.toLowerCase(), skill.name])).values()]
  const evidenceOr = (id: string, render: (context: CandidateContext) => string) => { const context = contextOf(id); return context ? render(context) : contextLabel(contexts.get(id)) }
  const rows = [
    { label: 'Job Fit', values: ids.map(id => matchLabel(matches.get(id), !!selectedJob)) },
    { label: 'Mandatory Skills', values: ids.map(id => {
      const match = readyMatch(id)
      const mandatory = selectedJob?.requirements?.filter(requirement => requirement.is_mandatory) ?? []
      return match && mandatory.length ? `${mandatory.filter(requirement => match.coverage.some(item => item.requirement_id === requirement.id && item.coverage_state === 'matched')).length} / ${mandatory.length}` : 'Not assessed'
    }) },
    { label: 'Evidence Strength', values: ids.map(id => readyMatch(id) ? `${Math.round(readyMatch(id)!.evidence_strength * 100)}%` : 'Pending') },
    ...skills.map(skill => ({ label: skill, values: ids.map(id => evidenceOr(id, () => {
      const found = assessed[id].find(item => item.name.toLowerCase() === skill.toLowerCase())
      if (!found) return 'Not reported'
      const status = skillStatus(found)
      const n = found.observations.length
      const seen = n ? `${n} observation${n === 1 ? '' : 's'}` : 'no public observations'
      return status === 'Contradicted' ? `Contradicted · claim conflicts with evidence (${seen})`
        : status === 'Supported' ? `Supported · ${seen}`
        : status === 'Demonstrated' ? `Demonstrated · ${seen}`
        : found.reported ? 'Unverified · reported skill' : `Not reported · ${seen}`
    })) })),
    { label: 'Top Project', values: ids.map(id => evidenceOr(id, context => context.evidence_records.find(record => record.source_type === 'github' || record.source_type === 'project_submission')?.observation ?? 'No project evidence available')) },
    { label: 'Experience', values: ids.map(id => evidenceOr(id, context => context.candidate.experience_years != null ? `${context.candidate.experience_years} yrs · reported` : 'Not available')) },
  ]
  const recovery = (id: string, name: string) => {
    const match = matches.get(id), context = contexts.get(id)
    const matchFailed = !!selectedJob && (match.phase === 'error' || match.phase === 'exhausted' || (match.value != null && 'status' in match.value && match.value.status === 'failed'))
    const contextFailed = context.phase === 'error' || context.phase === 'exhausted'
    if (!matchFailed && !contextFailed) return null
    return <button className="secondary-button comparison-retry" onClick={() => { if (matchFailed) matches.retry(id); if (contextFailed) contexts.retry(id) }}>Retry {name}</button>
  }
  return <section className="candidate-comparison">
    <nav aria-label="Breadcrumb" className="comparison-breadcrumb"><button onClick={() => setActiveView('jobs')}>Jobs</button><span>/</span><button onClick={() => setActiveView('job-detail')}>{selectedJob?.title ?? 'Select a job'}</button><span>/</span><span>Comparison</span></nav>
    <div className="comparison-heading"><div><h1>Candidate Comparison</h1><p>Side-by-side evidence for {selectedJob?.title ?? 'the selected job'}. Differences highlighted in gold.</p></div><button className="secondary-button" onClick={() => setPickerOpen(value => !value)} aria-expanded={pickerOpen} aria-controls="comparison-picker"><span aria-hidden="true">+</span> Add candidate</button></div>
    {onBack && <button className="comparison-back" onClick={onBack}>Back to job</button>}
    {pickerOpen && <fieldset id="comparison-picker" className="panel comparison-picker"><legend>Comparison candidates · select up to {MAX_COMPARISON}</legend>{listState === 'loading' && <p role="status">Loading candidates...</p>}{listState === 'ready' && !candidates.length && <p>No candidates available.</p>}{candidates.map(candidate => <label key={candidate.id}><input type="checkbox" checked={ids.includes(candidate.id)} disabled={!ids.includes(candidate.id) && ids.length >= MAX_COMPARISON} onChange={event => { const checked = event.target.checked; setIds(previous => checked ? [...previous, candidate.id] : previous.filter(id => id !== candidate.id)) }}/>{candidate.full_name}</label>)}<button className="secondary-button" onClick={() => setPickerOpen(false)}>Done</button></fieldset>}
    {listState === 'error' && <div role="alert" className="panel">Could not load candidates. <button className="secondary-button" onClick={() => setListAttempt(value => value + 1)}>Retry comparison</button></div>}
    {!selectedJob && <p>Select a job to compare role fit.</p>}
    {!ids.length ? <div className="panel comparison-empty"><h2>Select candidates to compare</h2><p>Add up to three candidates to review their skills and evidence side by side.</p><button className="primary-button" onClick={() => setPickerOpen(true)}>Add candidates</button></div> : <div className="comparison-scroll comparison-frame"><table className="comparison-table intelligence-comparison-table"><caption className="sr-only">Role-specific assessment for {selectedJob?.title ?? 'the selected job'}</caption><thead><tr><th scope="col"><span>{ids.length} selected · max {MAX_COMPARISON}</span></th>{ids.map(id => {
      const candidate = candidates.find(item => item.id === id)
      const name = candidate?.full_name ?? id
      return <th scope="col" key={id}><div className="comparison-person"><ProfileAvatar name={name}/><div><strong>{name}</strong><small>{candidate?.headline ?? 'Candidate'}</small></div><span className="comparison-score">{readyMatch(id) ? Math.round(readyMatch(id)!.final_score * 100) : '—'}</span><button className="comparison-remove" onClick={() => setIds(previous => previous.filter(item => item !== id))} aria-label={`Remove ${name}`}>×</button></div>{recovery(id, name)}</th>
    })}</tr></thead><tbody>{rows.map(row => {
      const different = ids.length > 1 && new Set(row.values).size > 1
      return <tr key={row.label} className={different ? 'comparison-difference' : ''}><th scope="row">{different && <span className="comparison-dot" aria-label="Values differ"/>}{row.label}</th>{row.values.map((value, index) => <td key={ids[index]}>{value}</td>)}</tr>
    })}</tbody><tfoot><tr><td/>{ids.map((id, index) => { const name = candidates.find(candidate => candidate.id === id)?.full_name.split(' ')[0] ?? 'Candidate'; return <td key={id}><button className={index === 0 ? 'primary-button' : 'secondary-button'} onClick={() => openCandidateDetail(id)}>View {name}’s Intelligence</button></td> })}</tr></tfoot></table></div>}
    <p className="comparison-note">Unverified means supporting public evidence is unavailable. Missing evidence does not imply a lack of competence.</p>
  </section>
}
