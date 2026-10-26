import { useEffect, useState } from 'react'
import type { CandidateDetail } from '@/types'
import { api } from '@/services/api'
import { useJob } from '@/context/JobContext'
import { useCandidateContext } from '@/hooks/useCandidateContext'
import { EvidenceBar } from '@/components/evidence/EvidenceBar'
import { EvidenceCard } from '@/components/evidence/EvidenceCard'
import { ContextFeedback } from '@/components/evidence/ContextFeedback'
import { labelForScore, provenanceSummary } from '@/types/context'
import { ResumeViewer } from './ResumeViewer'

export function CandidateProfileShell() {
  const { selectedCandidateId, selectedJob, backToDashboard } = useJob()
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [detailAttempt, setDetailAttempt] = useState(0)
  const [tab, setTab] = useState<'claims' | 'skills' | 'background' | 'resume'>('claims')
  const { context, phase, retry } = useCandidateContext(selectedCandidateId, tab === 'claims' || tab === 'skills')
  useEffect(() => {
    if (!selectedCandidateId) return
    let cancelled = false
    api.getCandidateById(selectedCandidateId).then(result => { if (!cancelled) setCandidate(result) }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [selectedCandidateId, detailAttempt])
  if (failed) return <section className="panel" role="alert"><h1>Candidate Not Found</h1><p>Candidate profile could not be loaded.</p><button onClick={() => { setFailed(false); setDetailAttempt(value => value + 1) }}>Retry profile</button><button onClick={backToDashboard}>Return to Dashboard</button></section>
  if (!candidate || !selectedCandidateId) return <p role="status">Loading candidate profile...</p>
  const records = context?.evidence_records ?? []
  const skills = [...new Map([...records.map(record => record.skill), ...candidate.top_skills].map(skill => [skill.toLowerCase(), skill])).values()]
  return <div className="page-stack"><div className="page-title"><button className="secondary-button" onClick={backToDashboard}>Back to Recruiter Overview</button>{selectedJob && <p><span>Active Job Context:</span> {selectedJob.title}</p>}</div>
    <section className="panel"><div className="page-title"><div><span className="preview-label">{candidate.id}</span><h1>{candidate.full_name}</h1><p>{candidate.headline}</p><p>{candidate.location} - {candidate.email}</p><p>{candidate.experience_years == null ? 'Experience not provided' : `${candidate.experience_years} years reported experience`}</p></div><div className="modal-actions"><button className="secondary-button" onClick={() => setTab('resume')}>Resume Reference</button><button disabled title="Available in Phase 4">Interview Brief - Phase 4</button></div></div>
      <div className="skill-list">{Object.entries(candidate.external_identifiers ?? {}).filter(([, url]) => url).map(([platform, url]) => /^https?:\/\//i.test(url as string) && <a key={platform} href={url as string} target="_blank" rel="noreferrer">{platform} profile (not independently verified)</a>)}</div>
      <p className="provenance-label">{context ? provenanceSummary(records) : 'Unassessed - context pending'}</p>{context && <EvidenceBar score={context.evidence_score} label={context.evidence_label} />}
    </section>
    <nav aria-label="Candidate profile sections" className="profile-tabs">{([['claims', 'Evidence & Claims'], ['skills', 'Reported Skills'], ['background', 'Background Summary']] as const).map(([value, label]) => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</nav>
    {tab === 'claims' && <section className="page-stack"><h2>Reported Resume Claims</h2><ContextFeedback phase={phase} retry={retry} />{context && <>
      {!context.claims.length && <p>No claims matched the extraction rules. Inspect the resume for additional reported experience.</p>}
      {context.claims.map(claim => <article key={claim.id} className="panel"><div className="page-title"><strong>{claim.section}{claim.skill && ` - ${claim.skill}`}</strong><span className="claim-state">{claim.verification_state}</span></div><p>{claim.claim_text}</p><small>{claim.provenance}</small></article>)}
      <h2>Evidence observations</h2>{!records.length && <p>No public evidence available. Absence of public signals is not a finding about competence.</p>}{records.map(record => <EvidenceCard key={record.id} record={record} />)}
    </>}</section>}
    {tab === 'skills' && <section className="panel"><h2>Core Technical Competencies</h2><p>Reported skills and associated observations; evidence tiers do not certify proficiency.</p><ContextFeedback phase={phase} retry={retry} /><div className="skill-list">{candidate.top_skills.map(skill => <span className="skill-tag" key={skill}>{skill}</span>)}</div>{context && skills.map(skill => {
      const supporting = records.filter(record => record.skill.toLowerCase() === skill.toLowerCase())
      const score = Math.round(supporting.reduce((total, record) => total + record.computed_weight, 0) * 1e9) / 1e9
      return <div className="skill-evidence-row" key={skill}><strong>{skill}</strong><span>{supporting.length} observations ? {score.toFixed(1)} points</span><EvidenceBar score={score} label={labelForScore(score)} /></div>
    })}</section>}
    {tab === 'background' && <section className="panel"><h2>Candidate Background Summary</h2><p>{candidate.summary || 'No background summary provided for this candidate record.'}</p></section>}
    {tab === 'resume' && <ResumeViewer key={selectedCandidateId} candidateId={selectedCandidateId} />}
  </div>
}
