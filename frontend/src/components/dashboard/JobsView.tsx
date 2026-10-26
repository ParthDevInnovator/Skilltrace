import { useState } from 'react'
import { useJob } from '@/context/JobContext'
import { JobStatus } from '@/components/common/JobStatus'
export function JobsView({ onCreate }: { onCreate: () => void }) {
  const { jobs, selectedJob, setSelectedJob, isLoadingJobs, jobError } = useJob()
  const [query, setQuery] = useState('')
  const filtered = jobs.filter(job => [job.id, job.title, job.department, job.location].some(value => value.toLowerCase().includes(query.trim().toLowerCase())))
  return <section className="page-stack"><div className="page-title"><div><h1>Jobs</h1><p>Browse requisitions and choose the role for your workspace.</p></div><button className="primary-button" onClick={onCreate}>Create Job</button></div>
    <JobStatus /><label htmlFor="jobs-filter">Search jobs</label><input id="jobs-filter" value={query} onChange={e => setQuery(e.target.value)} placeholder="ID, title, department or location" />
    {selectedJob && <button className="secondary-button" onClick={() => setSelectedJob(null)}>Clear active job</button>}
    {!isLoadingJobs && !jobError && !filtered.length && <div className="panel">No jobs found. Try another search or create a job.</div>}
    <div className="jobs-grid">{filtered.map(job => <article key={job.id} className="panel"><span className="preview-label">{job.id.startsWith('CUSTOM-') ? 'Custom - this session only' : 'Seeded requisition'}</span><h2>{job.title}</h2><p>{job.department} - {job.location}</p><ul>{job.requirements_preview?.map((r, i) => <li key={i}>{r}</li>)}</ul><details><summary>Full job description</summary><p className="pre-wrap">{job.description_raw}</p></details><button className="secondary-button" aria-pressed={selectedJob?.id === job.id} onClick={() => setSelectedJob(job)}>{selectedJob?.id === job.id ? 'Active requisition' : 'Set as active job'}</button></article>)}</div>
  </section>
}
