import { ResumeUpload } from './ResumeUpload'
import { useJob } from '@/context/JobContext'
import { useAuth } from '@/context/AuthContext'
export function AddCandidatesView() {
  const { selectedJob, setActiveView } = useJob()
  const { hasRole } = useAuth()
  return <section className="page-stack"><button onClick={() => setActiveView('job-detail')}>Back to job</button><h1>Add Candidates</h1><p>{selectedJob ? `Evaluate uploaded candidates against ${selectedJob.title}.` : 'Upload a candidate resume.'}</p>{hasRole('recruiter') ? <ResumeUpload pipeline /> : <p role="alert">Your role cannot upload candidate resumes.</p>}<p>Batch upload is not available. Upload one resume at a time.</p></section>
}
