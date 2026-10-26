import { useJob } from '@/context/JobContext'
import { JobStatus } from '@/components/common/JobStatus'
import { CandidateGrid } from '@/components/dashboard/CandidateGrid'
export function DashboardOverview({ onOpenCustomJDModal }: { onOpenCustomJDModal: () => void }) {
  const { selectedJob, jobs, isLoadingJobs, jobError } = useJob()
  return <div className="page-stack"><div className="page-title"><div><h1>Recruiter Overview</h1><p>Your hiring workspace at a glance.</p></div><button className="primary-button" onClick={onOpenCustomJDModal}>Create Job</button></div>
    <div className="metrics-grid"><article className="panel"><p>Available Jobs</p><strong className="metric-value">{isLoadingJobs ? '...' : jobError ? '--' : jobs.length}</strong><small>Seeded and session requisitions</small></article>{['Candidates Reviewed', 'Interviews Scheduled', 'Awaiting Review'].map(label => <article className="panel" key={label}><p>{label}</p><strong className="metric-value">--</strong><small>Activity tracking is not connected</small></article>)}</div>
    <JobStatus />
    <section className="panel"><h2>Active Requisition</h2>{selectedJob ? <><h3>{selectedJob.title}</h3><p>{selectedJob.department} - {selectedJob.location}</p><div className="skill-list">{selectedJob.requirements_preview?.map((r, i) => <span className="skill-tag" key={i}>{r}</span>)}</div><small>Requirement preview only. Role-specific matching is planned for Phase 3.</small></> : <p>Select a job in the header or create a custom requisition.</p>}</section>
    <section className="page-stack"><div><h2>Candidate Pool</h2><p>Seeded profiles - Evidence observations are available; role fit is not assessed yet.</p></div><CandidateGrid /></section>
    <p className="preview-label">Digest export and interview briefs will be available in Phase 4.</p>
  </div>
}
