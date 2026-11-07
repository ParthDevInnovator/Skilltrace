import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import type { CandidateSummary, ExternalIdentifiers } from '@/types/candidate'
import type { RankedCandidate } from '@/types/matching'
import { useJob } from '@/context/JobContext'
import { useAuth } from '@/context/AuthContext'
import { ProfileAvatar } from '@/components/layout/ProfileAvatar'

export function TalentPoolView() {
  const { setActiveView, openCandidateDetail, selectedJob, searchQuery } = useJob()
  const { hasRole } = useAuth()
  const [candidates, setCandidates] = useState<CandidateSummary[]>([])
  const [rankings, setRankings] = useState<RankedCandidate[]>([])
  const [query, setQuery] = useState('')
  const [skill, setSkill] = useState('')
  const [platform, setPlatform] = useState('')
  const [evidenceOnly, setEvidenceOnly] = useState(false)
  const [profiles, setProfiles] = useState<Record<string, ExternalIdentifiers>>({})
  const [platformLoading, setPlatformLoading] = useState(false)
  const [platformError, setPlatformError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rankingError, setRankingError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const canRank = hasRole('recruiter')
  useEffect(() => {
    let live = true
    setLoading(true); setError('')
    api.getCandidates().then(rows => { if (live) setCandidates(rows) }).catch(() => { if (live) setError('Could not load the talent pool.') }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [attempt])
  useEffect(() => {
    let live = true
    setRankings([]); setRankingError(false)
    if (selectedJob && canRank) api.rankCandidates({ job_id: selectedJob.id }).then(rows => { if (live) setRankings(rows) }).catch(() => { if (live) setRankingError(true) })
    return () => { live = false }
  }, [selectedJob?.id, canRank, attempt])
  useEffect(() => {
    let live = true
    if (!platform) return
    setPlatformLoading(true); setPlatformError(false)
    void Promise.allSettled(candidates.map(async candidate => {
      const detail = await api.getCandidateById(candidate.id)
      return [candidate.id, detail.external_identifiers ?? {}] as const
    })).then(results => {
      if (!live) return
      setProfiles(Object.fromEntries(results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])))
      setPlatformError(results.some(result => result.status === 'rejected'))
      setPlatformLoading(false)
    })
    return () => { live = false }
  }, [platform, candidates, attempt])
  const skills = [...new Set(candidates.flatMap(candidate => candidate.top_skills))].sort()
  const visible = candidates.filter(candidate => {
    const text = `${candidate.full_name} ${candidate.headline} ${candidate.location} ${candidate.top_skills.join(' ')}`.toLowerCase()
    const rank = rankings.find(row => row.candidate_id === candidate.id)
    return [query, searchQuery].every(value => !value || text.includes(value.toLowerCase())) && (!skill || candidate.top_skills.includes(skill)) && (!platform || Boolean(profiles[candidate.id]?.[platform as keyof ExternalIdentifiers])) && (!evidenceOnly || rank?.context_status === 'ready' && rank.evidence_strength >= .7)
  })
  return <section className="talent-library">
    <div className="talent-heading"><div><h1>Talent Pool</h1><p>A searchable library of candidate intelligence.</p></div><button className="primary-button" onClick={() => setActiveView('add-candidates')}><span className="material-symbols-outlined" aria-hidden="true">upload</span> Add Resumes</button></div>
    <section className="talent-filters" aria-label="Talent pool filters"><div className="talent-filter-row"><label className="talent-search"><span className="material-symbols-outlined" aria-hidden="true">search</span><input aria-label="Search talent pool" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name, skill, role, location..."/></label><select aria-label="Filter by skill" value={skill} onChange={event => setSkill(event.target.value)}><option value="">Skills</option>{skills.map(value => <option key={value}>{value}</option>)}</select><select aria-label="Filter by platform" value={platform} onChange={event => setPlatform(event.target.value)}><option value="">Platform</option><option value="github">GitHub</option><option value="linkedin">LinkedIn</option><option value="leetcode">LeetCode</option></select><button className="talent-evidence-filter" aria-pressed={evidenceOnly} disabled={!selectedJob || !canRank || rankingError} onClick={() => setEvidenceOnly(value => !value)}>Evidence 70%+</button></div><div className="talent-quick-skills">{skills.slice(0, 4).map(value => <button key={value} aria-pressed={skill === value} onClick={() => setSkill(previous => previous === value ? '' : value)}>{value}</button>)}<span>{candidates.length} profiles{!loading && ` · ${visible.length} shown`}</span>{(query || skill || platform || evidenceOnly) && <button onClick={() => { setQuery(''); setSkill(''); setPlatform(''); setEvidenceOnly(false) }}>Clear filters</button>}</div></section>
    {error && <div role="alert" className="panel">{error} <button onClick={() => setAttempt(value => value + 1)}>Retry</button></div>}
    {rankingError && <p role="status" className="talent-notice">Job assessments could not be loaded. Candidate profiles remain available. <button onClick={() => setAttempt(value => value + 1)}>Retry assessments</button></p>}
    {platform && platformError && <p role="status" className="talent-notice">Some source profiles could not be loaded. Platform results may be incomplete. <button onClick={() => setAttempt(value => value + 1)}>Retry profiles</button></p>}
    {loading || platform && platformLoading ? <p role="status" className="panel">Loading candidate profiles...</p> : !error && <><div className="talent-card-grid">{visible.map(candidate => {
      const rank = rankings.find(row => row.candidate_id === candidate.id)
      const assessed = rank?.context_status === 'ready'
      const fit = assessed ? Math.round(rank.final_score * 100) : null
      const evidence = assessed ? Math.round(rank.evidence_strength * 100) : null
      return <article className="talent-card" key={candidate.id}><div className="talent-card-person"><ProfileAvatar name={candidate.full_name}/><div><h2>{candidate.full_name}</h2><p>{candidate.headline}{candidate.location ? ` · ${candidate.location}` : ''}</p></div><span className="talent-fit" title={fit != null ? `Job fit for ${selectedJob?.title}` : 'Job fit not assessed'}>{fit ?? '—'}</span></div><div className="talent-card-tags">{candidate.top_skills.slice(0,2).map(value => <span key={value}>{value}</span>)}{candidate.top_skills.length > 2 && <span>+{candidate.top_skills.length - 2} skills</span>}<small>{evidence != null ? `Evidence ${evidence}%` : 'Evidence not assessed'}</small></div><div className="talent-evidence-track" role={evidence != null ? 'meter' : undefined} aria-label={evidence != null ? `Evidence strength for ${candidate.full_name}` : undefined} aria-valuemin={evidence != null ? 0 : undefined} aria-valuemax={evidence != null ? 100 : undefined} aria-valuenow={evidence ?? undefined}><i style={{ width: `${evidence ?? 0}%` }}/></div><div className="talent-card-actions"><button className="secondary-button" aria-label={`View Intelligence for ${candidate.full_name}`} onClick={() => openCandidateDetail(candidate.id)}>View Intelligence<span className="sr-only"> for {candidate.full_name}</span></button><button className="primary-button talent-compare" aria-label={`Compare ${candidate.full_name}`} onClick={() => { openCandidateDetail(candidate.id); setActiveView('comparison') }}><span className="material-symbols-outlined" aria-hidden="true">compare_arrows</span></button></div></article>
    })}</div>{!visible.length && <div className="panel talent-empty"><h2>{candidates.length ? 'No matching candidates' : 'Your talent pool is empty'}</h2><p>{candidates.length ? 'Try another search or adjust your filters.' : 'Add resumes to start building your candidate library.'}</p>{!candidates.length && <button className="primary-button" onClick={() => setActiveView('add-candidates')}>Add Resumes</button>}</div>}</>}
    <p className="talent-notice">{selectedJob ? `Scores reflect assessments for ${selectedJob.title}. ` : 'Select a job to assess role fit. '}Skills are reported; evidence strength does not certify proficiency.</p>
  </section>
}
