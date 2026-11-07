import type { CandidateDetail } from '@/types'
import type { CandidateContext } from '@/types/context'
import type { Job } from '@/types/job'

export function IntelligenceOverview({ candidate, context, job, inspectClaims }: { candidate: CandidateDetail; context: CandidateContext | null; job: Job | null; inspectClaims: () => void }) {
  const records = context?.evidence_records ?? []
  const claims = context?.claims ?? []
  const skills = [...new Set([...candidate.top_skills, ...records.map(record => record.skill)])]
  const gaps = skills.filter(skill => !records.some(record => record.skill.toLowerCase() === skill.toLowerCase()))
  const contradictions = claims.filter(claim => claim.verification_state === 'contradicted').length
  const coverage = (mandatory: boolean) => {
    const requirements = job?.requirements?.filter(requirement => requirement.is_mandatory === mandatory) ?? []
    const supported = requirements.filter(requirement => records.some(record => requirement.requirement_text.toLowerCase().includes(record.skill.toLowerCase()))).length
    return { label: requirements.length ? `${supported}/${requirements.length}` : 'Not assessed', percent: requirements.length ? supported / requirements.length * 100 : 0 }
  }
  return <div className="intelligence-grid">
    <div className="intelligence-primary">
      <section className="intelligence-panel">
        <h2>A. Intelligence Overview</h2>
        <p className="intelligence-summary">{candidate.summary || 'Review the candidate’s reported experience alongside supporting public evidence.'}</p>
        <div className="intelligence-metrics">
          {[{ title: 'Mandatory coverage', ...coverage(true) }, { title: 'Preferred coverage', ...coverage(false) }, { title: 'Contradictions', label: context ? `${contradictions} open` : 'Pending', percent: context && !contradictions ? 100 : 0 }].map(metric => <div className="intelligence-metric" key={metric.title}><span>{metric.title}</span><strong>{metric.label}</strong><div className="intelligence-track"><i style={{ width: `${metric.percent}%` }} /></div></div>)}
        </div>
      </section>
      <section className="intelligence-panel">
        <h2>B. Skill Intelligence</h2>
        {skills.length === 0 && <p className="intelligence-summary">No skills reported yet.</p>}
        {skills.map(skill => {
          const supporting = records.filter(record => record.skill.toLowerCase() === skill.toLowerCase())
          const supported = claims.some(claim => claim.skill?.toLowerCase() === skill.toLowerCase() && claim.verification_state === 'supported')
          return <div className="intelligence-skill" key={skill}><strong>{skill}</strong><span className={`intelligence-status ${supporting.length ? 'demonstrated' : ''}`}>{supporting.length ? 'Demonstrated' : supported ? 'Supported' : 'Unverified'}</span><span>{supporting.length ? `${supporting.length} supporting observation${supporting.length === 1 ? '' : 's'}` : 'Reported without public evidence'}</span></div>
        })}
      </section>
      <section className="intelligence-panel">
        <h2>C. Technical Projects and Evidence</h2>
        {!records.length && <p className="intelligence-summary">No public project evidence available yet.</p>}
        {records.map(record => <article className="intelligence-project" key={record.id}><div className="intelligence-project-icon" aria-hidden="true"><span className="material-symbols-outlined">{record.source_type === 'github' ? 'code' : record.source_type === 'linkedin' ? 'work' : 'terminal'}</span></div><div className="intelligence-project-content"><p>{record.observation}</p><small>{candidate.full_name}{record.observation_date ? ` · ${record.observation_date}` : ''}</small><div className="intelligence-project-tags"><span>{record.skill}</span><span>{record.source_type.replaceAll('_', ' ')}</span>{/^https?:\/\//i.test(record.source_url) && <a href={record.source_url} target="_blank" rel="noreferrer">{record.source_url.replace(/^https?:\/\//, '')}</a>}</div><small>{record.provenance}</small></div><span className="intelligence-status demonstrated">Demonstrated</span></article>)}
      </section>
    </div>
    <aside className="intelligence-aside">
      <section className="intelligence-panel"><h2>Source Profiles</h2>{Object.entries(candidate.external_identifiers ?? {}).filter(([, url]) => url).map(([source, url]) => <a className="intelligence-source" key={source} href={/^https?:\/\//i.test(url!) ? url! : undefined} target="_blank" rel="noreferrer"><span className="intelligence-project-icon material-symbols-outlined">{source === 'github' ? 'code' : source === 'linkedin' ? 'work' : 'terminal'}</span><span><strong>{source === 'github' ? 'GitHub' : source === 'linkedin' ? 'LinkedIn' : 'LeetCode'}</strong><small>{records.filter(record => record.source_type === source).length} linked observations</small></span></a>)}{!Object.values(candidate.external_identifiers ?? {}).some(Boolean) && <p className="intelligence-summary">No source profiles linked.</p>}</section>
      <section className="intelligence-panel intelligence-gaps"><h2><span className="material-symbols-outlined">warning</span> Intelligence Gaps</h2><p className="intelligence-summary">{!context ? 'Evidence assessment is pending.' : gaps.length ? `${gaps.join(', ')}: no public evidence available.` : 'No gaps found among the listed skills.'}</p><button type="button" onClick={inspectClaims}>Review Evidence & Claims</button></section>
      <section className="intelligence-panel intelligence-legend"><h2>Verification Legend</h2><p>Supported: evidence supports a reported claim. Demonstrated: linked observations are available. Unverified: claim without supporting evidence. Contradictory: evidence conflicts.</p><p>Missing public evidence does not imply a lack of competence.</p></section>
    </aside>
  </div>
}
