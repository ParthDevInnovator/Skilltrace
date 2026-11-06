import { useJob } from '@/context/JobContext'
import { CandidateGrid } from './CandidateGrid'
import { RequirementChips } from './RequirementFilter'
import { JobStatus } from '@/components/common/JobStatus'
import { useAuth } from '@/context/AuthContext'
export function DashboardOverview({ onOpenCustomJDModal }: { onOpenCustomJDModal: () => void }) {
  const { jobs, selectedJob, openJobWorkspace } = useJob()
  const { hasRole } = useAuth()
  return <div className="page-stack"><h1>Recruiter Overview</h1><JobStatus /><section className="panel"><h2>Active Requisition</h2>{selectedJob ? <><h2>{selectedJob.title}</h2><p>{selectedJob.department} - {selectedJob.location}</p><RequirementChips job={selectedJob} /></> : <p>Select a job in the header or create a custom requisition.</p>}</section><section className="panel"><div className="page-heading"><h2>{jobs.length} available jobs</h2><button disabled={!hasRole('recruiter')} onClick={onOpenCustomJDModal}>Create a requisition</button></div><div className="grid grid-cols-1 md:grid-cols-3 gap-4">{jobs.slice(0,3).map(job => <article key={job.id}><p className="font-semibold">{job.title}</p><p>{job.department} · {job.location}</p><button onClick={() => openJobWorkspace(job)}>Open workspace</button></article>)}</div>{!jobs.length && <p>No jobs available.</p>}</section><section className="page-stack"><h2>Candidate Pool</h2><p>Rank by fit to assess candidates against the selected job. Missing evidence is unknown.</p><CandidateGrid /></section></div>
}
