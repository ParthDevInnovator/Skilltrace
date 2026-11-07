import { useEffect, useState } from 'react'
import { useJob } from '@/context/JobContext'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/services/api'
import { ProfileAvatar } from '@/components/layout/ProfileAvatar'
import type { CandidateSummary } from '@/types'
import type { ExtractedRequirement, RankedCandidate } from '@/types/matching'

function Icon({ name }: { name: string }) { return <span className="material-symbols-outlined" aria-hidden="true">{name}</span> }
export function CandidateResultsView() {
  const { selectedJob, searchQuery, selectedSkill, setSelectedSkill, openCandidateDetail, setActiveView } = useJob()
  const { hasRole } = useAuth()
  const canRank = hasRole('recruiter')
  const [attempt, setAttempt] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [fit, setFit] = useState('all')
  const [evidence, setEvidence] = useState('all')
  const [status, setStatus] = useState('all')
  const [data, setData] = useState<{key: string; candidates: CandidateSummary[]; ranks: RankedCandidate[]; requirements: ExtractedRequirement[]; error: string; rankingError: boolean} | null>(null)
  const key = `${selectedJob?.id ?? ''}:${canRank}:${attempt}`
  useEffect(() => {
    let live = true
    async function load() {
      const [candidates, ranking] = await Promise.allSettled([
        api.getCandidates(),
        selectedJob && canRank ? Promise.all([api.rankCandidates({job_id: selectedJob.id}), api.extractRequirements({job_id: selectedJob.id})]) : Promise.resolve(null),
      ])
      if (!live) return
      const ranked = ranking.status === 'fulfilled' ? ranking.value : null
      setData({ key, candidates: candidates.status === 'fulfilled' ? candidates.value : [], ranks: ranked?.[0] ?? [], requirements: ranked?.[1] ?? [], error: candidates.status === 'rejected' ? 'Could not load candidates.' : '', rankingError: ranking.status === 'rejected' })
    }
    void load()
    return () => { live = false }
  }, [key, selectedJob, canRank])
  const current = data?.key === key ? data : null
  const candidates = current?.candidates ?? []
  const ranks = current?.ranks ?? []
  const rankById = new Map(ranks.map(row => [row.candidate_id, row]))
  const ready = ranks.filter(row => row.context_status === 'ready')
  const strong = ready.filter(row => ['Strong', 'Good'].includes(row.evidence_label)).length
  const needsReview = ready.filter(row => row.coverage.some(item => item.coverage_state === 'insufficient_evidence' || item.coverage_state === 'not_assessed')).length
  const average = ready.length ? Math.round(ready.reduce((sum,row) => sum + row.evidence_strength, 0) / ready.length * 100) : null
  const mandatoryIds = new Set(current?.requirements.filter(requirement => requirement.is_mandatory).map(requirement => requirement.id))
  const visible = candidates.filter(candidate => {
    const row = rankById.get(candidate.id)
    return `${candidate.full_name} ${candidate.headline} ${candidate.top_skills.join(' ')}`.toLowerCase().includes(searchQuery.toLowerCase())
      && (!selectedSkill || selectedSkill === 'All' || candidate.top_skills.some(skill => skill.toLowerCase() === selectedSkill.toLowerCase()))
      && (fit === 'all' || (row?.context_status === 'ready' && row.final_score * 100 >= Number(fit)))
      && (evidence === 'all' || (row?.context_status === 'ready' && row.evidence_strength * 100 >= Number(evidence)))
      && (status === 'all' || row?.context_status === status)
  }).sort((a,b) => (rankById.get(b.id)?.final_score ?? -1) - (rankById.get(a.id)?.final_score ?? -1))
  const rankingAvailable = !!current && !current.rankingError && !!selectedJob && canRank
  const metrics = [
    {icon:'person_check',value:rankingAvailable ? ready.length : null,label:'Candidates Analyzed'},
    {icon:'verified_user',value:rankingAvailable ? strong : null,label:'Strong Evidence Matches'},
    {icon:'flag',value:rankingAvailable ? needsReview : null,label:'Needs Review'},
    {icon:'stacks',value:average === null ? null : `${average}%`,label:'Avg. Evidence Strength'},
  ]
  function clearFilters() { setFit('all');setEvidence('all');setStatus('all');setSelectedSkill('') }
  return <section className="candidate-results"><div className="results-heading"><div><h1>Candidate Intelligence</h1><p>Understand how every candidate aligns with this job{selectedJob ? ` - ${selectedJob.title}.` : '. Select a job to assess fit.'}</p></div><div className="results-actions"><button aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}><Icon name="filter_list" />Filters</button><button className="results-compare" disabled={!canRank} onClick={() => setActiveView('comparison')}><Icon name="compare_arrows" />Compare Candidates</button></div></div>
    <div className="results-metrics">{metrics.map(metric => <article key={metric.label}><span className="results-metric-icon"><Icon name={metric.icon} /></span><div><strong>{metric.value ?? '—'}</strong><span>{metric.label}</span></div></article>)}</div>
    {current?.rankingError && <p role="alert" className="notice error">Job rankings could not be loaded. <button onClick={() => setAttempt(value => value + 1)}>Retry rankings</button></p>}
    <div className="results-table-panel"><div className="results-filters"><div><label><span className="sr-only">Minimum job fit</span><select value={fit} onChange={event => setFit(event.target.value)}><option value="all">Job Fit: All</option>{[60,70,80,90].map(value => <option key={value} value={value}>Job Fit: {value}%+</option>)}</select></label><label><span className="sr-only">Skills</span><select value={selectedSkill || ''} onChange={event => setSelectedSkill(event.target.value)}><option value="">Skills: All</option>{[...new Set([...candidates.flatMap(candidate => candidate.top_skills), ...(selectedSkill ? [selectedSkill] : [])])].sort().map(skill => <option key={skill} value={skill}>Skills: {skill}</option>)}</select></label><label><span className="sr-only">Minimum evidence strength</span><select value={evidence} onChange={event => setEvidence(event.target.value)}><option value="all">Evidence: All</option>{[50,70,80,90].map(value => <option key={value} value={value}>Evidence: {value}%+</option>)}</select></label><label><span className="sr-only">Analysis status</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Status: All</option><option value="ready">Analyzed</option><option value="building">Processing</option><option value="failed">Failed</option></select></label><select aria-label="Platform source" disabled title="Platform source filtering is unavailable in the list API"><option>Source: All platforms</option></select></div><span role="status">{visible.length} of {candidates.length} shown</span></div>
    {filtersOpen && <div className="results-filter-details"><p>Fit and evidence filters use analyzed results. Needs Review counts candidates with insufficient or unassessed requirement evidence. Identity confidence is not supplied by the API.</p><button onClick={clearFilters}>Clear filters</button><button onClick={() => setAttempt(value => value + 1)}>Refresh results</button></div>}
    {!current ? <p className="results-empty" role="status">Loading candidate intelligence...</p> : current.error ? <div className="results-empty" role="alert">{current.error} <button onClick={() => setAttempt(value => value + 1)}>Retry candidates</button></div> : <div className="results-table-scroll"><table><thead><tr>{['Candidate','Technical Skills','Job Fit','Mandatory','Evidence','Identity','Action'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{visible.map(candidate => {
      const row = rankById.get(candidate.id)
      const assessed = row?.context_status === 'ready'
      const mandatoryMatched = row?.coverage.filter(item => mandatoryIds.has(item.requirement_id) && item.coverage_state === 'matched').length ?? 0
      return <tr key={candidate.id}><td><div className="results-person"><ProfileAvatar name={candidate.full_name} /><div><strong>{candidate.full_name}</strong><small>{candidate.headline || candidate.location || 'No headline provided'}</small></div></div></td><td><div className="results-skills">{candidate.top_skills.slice(0,2).map(skill => <span key={skill}>{skill}</span>)}{candidate.top_skills.length > 2 && <span title={candidate.top_skills.slice(2).join(', ')}>+{candidate.top_skills.length - 2}</span>}{!candidate.top_skills.length && <span>Unknown</span>}</div></td><td><strong className="results-fit">{assessed ? Math.round(row.final_score * 100) : '—'}</strong></td><td title="Fully matched mandatory requirements">{assessed && mandatoryIds.size ? `${mandatoryMatched}/${mandatoryIds.size}` : '—'}</td><td>{assessed ? <div className="results-evidence" title={`Evidence strength: ${Math.round(row.evidence_strength * 100)}%`}><div><span style={{width:`${Math.max(0, Math.min(100, row.evidence_strength * 100))}%`}} /></div><small>{Math.round(row.evidence_strength * 100)}%</small></div> : <span>—</span>}</td><td><span className="results-identity">Unavailable</span><small className="results-status">{row?.context_status === 'ready' ? 'Analyzed' : row?.context_status === 'building' ? 'Processing' : row?.context_status === 'failed' ? 'Failed' : 'Not assessed'}</small></td><td><button className="results-view" aria-label={`View Intelligence for ${candidate.full_name}`} onClick={() => openCandidateDetail(candidate.id)}>View Intelligence<span className="sr-only"> for {candidate.full_name}</span></button></td></tr>
    })}</tbody></table>{!visible.length && <div className="results-empty"><p>No candidates match these filters.</p><button onClick={clearFilters}>Clear filters</button></div>}</div>}</div>
    <p className="results-data-note">Results evaluate the shared candidate pool against the selected job. Evidence strength reflects available observations; identity confidence is unavailable.</p>
  </section>
}
