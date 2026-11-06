import { useJob } from '@/context/JobContext'
import { useAuth } from '@/context/AuthContext'
import { CandidateGrid } from './CandidateGrid'
import { CandidateComparisonView } from './CandidateComparisonView'
export function JobDetailWorkspace() {
  const { selectedJob, setActiveView, jobWorkspaceTab, setJobWorkspaceTab } = useJob()
  const { hasRole } = useAuth()
  if (!selectedJob) return <section className="panel"><h1>Select a job</h1><button onClick={() => setActiveView('jobs')}>Browse jobs</button></section>
  return <section className="page-stack"><button onClick={() => setActiveView('jobs')}>Back to Jobs</button><div className="page-heading"><div><h1>{selectedJob.title}</h1><p>{selectedJob.department} · {selectedJob.location}</p></div>{hasRole('recruiter') && <button className="primary-button" onClick={() => setActiveView('add-candidates')}>Add Candidates</button>}</div><nav className="profile-tabs" aria-label="Job workspace">{(['overview','candidates','requirements','comparison','activity'] as const).map(tab => <button key={tab} aria-pressed={tab === jobWorkspaceTab} onClick={() => setJobWorkspaceTab(tab)}>{tab}</button>)}</nav>
  {jobWorkspaceTab === 'overview' && <article className="panel"><h2>Role description</h2><p className="whitespace-pre-wrap">{selectedJob.description_raw}</p><p>Fit is unassessed until you rank candidates against this role.</p></article>}
  {(jobWorkspaceTab === 'overview' || jobWorkspaceTab === 'candidates') && <CandidateGrid key={selectedJob.id} />}
  {jobWorkspaceTab === 'requirements' && <article className="panel"><h2>Role requirements</h2>{selectedJob.requirements?.length ? <ul>{selectedJob.requirements.map(r => <li key={r.id}>{r.requirement_text} — {r.is_mandatory ? 'Mandatory' : 'Preferred'}</li>)}</ul> : <p>No structured requirements available.</p>}</article>}
  {jobWorkspaceTab === 'comparison' && <CandidateComparisonView />}
  {jobWorkspaceTab === 'activity' && <p className="panel">Job activity history is not available in this workspace.</p>}</section>
}
