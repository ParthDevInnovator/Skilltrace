import type { CandidateDetail } from '@/types'
import type { CandidateContext } from '@/types/context'
import type { Job } from '@/types/job'
import type { ExtractedRequirement, MatchResponse } from '@/types/matching'
import { useJdMatch } from '@/hooks/useJdMatch'
import { assessSkills, observationCount, skillStatus } from '@/types/skills'

type Metric = { label: string; percent: number }

/** Coverage counts come from the backend match, exactly as JD Match shows them (OI-10). */
export function matchCoverage(match: MatchResponse | null, requirements: ExtractedRequirement[], mandatory: boolean, exhausted = false): Metric {
  if (!match || ('status' in match && match.status === 'building')) return { label: exhausted ? 'Still building' : 'Assessing…', percent: 0 }
  if ('status' in match) return { label: 'Unavailable', percent: 0 }
  const ids = new Set(requirements.filter(requirement => requirement.is_mandatory === mandatory).map(requirement => requirement.id))
  const rows = match.coverage.filter(row => ids.has(row.requirement_id))
  if (!rows.length) return { label: 'Not assessed', percent: 0 }
  const matched = rows.filter(row => row.coverage_state === 'matched').length
  const partial = rows.filter(row => row.coverage_state === 'partially_supported').length
  return { label: `${matched}/${rows.length}${partial ? ` · ${partial} partial` : ''}`, percent: matched / rows.length * 100 }
}

export function IntelligenceOverview({ candidate, context, job, inspectClaims, canMatch = true }: { candidate: CandidateDetail; context: CandidateContext | null; job: Job | null; inspectClaims: () => void; canMatch?: boolean }) {
  const match = useJdMatch(candidate.id, job?.id, canMatch)
  const records = context?.evidence_records ?? []
  const claims = context?.claims ?? []
  const skills = assessSkills(candidate.top_skills, context)
  const gaps = skills.filter(skill => skill.reported && !skill.observations.length).map(skill => skill.name)
  const contradictions = claims.filter(claim => claim.verification_state === 'contradicted').length
  const coverage = (mandatory: boolean): Metric => !job ? { label: 'Select a job', percent: 0 }
    : !canMatch ? { label: 'Restricted', percent: 0 }
    : matchCoverage(match.result, match.requirements, mandatory, match.exhausted)
  const matchFailed = !!match.result && 'status' in match.result && match.result.status === 'failed'
  return <div className="intelligence-grid">
    <div className="intelligence-primary">
      <section className="intelligence-panel">
        <h2>A. Intelligence Overview</h2>
        <p className="intelligence-summary">{candidate.summary || 'Review the candidate’s reported experience alongside supporting public evidence.'}</p>
        <div className="intelligence-metrics">
          {[{ title: 'Mandatory coverage', ...coverage(true) }, { title: 'Preferred coverage', ...coverage(false) }, { title: 'Contradictions', label: context ? `${contradictions} open` : 'Pending', percent: context && !contradictions ? 100 : 0 }].map(metric => <div className="intelligence-metric" key={metric.title}><span>{metric.title}</span><strong>{metric.label}</strong><div className="intelligence-track"><i style={{ width: `${metric.percent}%` }} /></div></div>)}
        </div>
        {(matchFailed || match.exhausted) && <p role="alert" className="intelligence-summary">Coverage could not be loaded. <button type="button" onClick={match.retry}>Retry coverage</button></p>}
      </section>
      <section className="intelligence-panel">
        <h2>B. Skill Intelligence</h2>
        {skills.length === 0 && <p className="intelligence-summary">No skills reported yet.</p>}
        {skills.map(skill => {
          const status = skillStatus(skill)
          return <div className="intelligence-skill" key={skill.name}><strong>{skill.name}</strong><span className={`intelligence-status ${status === 'Demonstrated' || status === 'Supported' ? 'demonstrated' : status === 'Contradicted' ? 'contradicted' : ''}`}>{status}</span><span>{observationCount(skill)}{skill.reported ? '' : ' · not on resume'}</span></div>
        })}
      </section>
      <section className="intelligence-panel">
        <h2>C. Technical Projects and Evidence</h2>
        {!records.length && <p className="intelligence-summary">No public project evidence available yet.</p>}
        {records.map(record => <article className="intelligence-project" key={record.id}><div className="intelligence-project-icon" aria-hidden="true"><span className="material-symbols-outlined">{record.source_type === 'github' ? 'code' : record.source_type === 'linkedin' ? 'work' : 'terminal'}</span></div><div className="intelligence-project-content"><p>{record.observation}</p><small>{candidate.full_name}{record.observation_date ? ` · ${record.observation_date}` : ''}</small><div className="intelligence-project-tags"><span>{record.canonical_skill ?? record.skill}</span><span>{record.source_type.replaceAll('_', ' ')}</span>{/^https?:\/\//i.test(record.source_url) && <a href={record.source_url} target="_blank" rel="noreferrer">{record.source_url.replace(/^https?:\/\//, '')}</a>}</div><small>{record.provenance}</small></div><span className="intelligence-status demonstrated">Demonstrated</span></article>)}
      </section>
    </div>
    <aside className="intelligence-aside">
      <section className="intelligence-panel"><h2>Source Profiles</h2>{Object.entries(candidate.external_identifiers ?? {}).filter(([, url]) => url).map(([source, url]) => <a className="intelligence-source" key={source} href={/^https?:\/\//i.test(url!) ? url! : undefined} target="_blank" rel="noreferrer"><span className="intelligence-project-icon material-symbols-outlined">{source === 'github' ? 'code' : source === 'linkedin' ? 'work' : 'terminal'}</span><span><strong>{source === 'github' ? 'GitHub' : source === 'linkedin' ? 'LinkedIn' : 'LeetCode'}</strong><small>{records.filter(record => record.source_type === source).length} linked observations</small></span></a>)}{!Object.values(candidate.external_identifiers ?? {}).some(Boolean) && <p className="intelligence-summary">No source profiles linked.</p>}</section>
      <section className="intelligence-panel intelligence-gaps"><h2><span className="material-symbols-outlined">warning</span> Intelligence Gaps</h2><p className="intelligence-summary">{!context ? 'Evidence assessment is pending.' : gaps.length ? `${gaps.join(', ')}: no public evidence available.` : 'No gaps found among the listed skills.'}</p><button type="button" onClick={inspectClaims}>Review Evidence & Claims</button></section>
      <section className="intelligence-panel intelligence-legend"><h2>Verification Legend</h2><p>Supported: evidence supports a reported claim. Demonstrated: linked observations are available. Unverified: claim without supporting evidence. Contradictory: evidence conflicts.</p><p>Missing public evidence does not imply a lack of competence.</p></section>
    </aside>
  </div>
}
