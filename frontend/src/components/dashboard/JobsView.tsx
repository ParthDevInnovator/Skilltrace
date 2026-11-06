import { useEffect, useState } from 'react'
import { useJob } from '@/context/JobContext'
import { JobStatus } from '@/components/common/JobStatus'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/services/api'
import type { SimilarJob } from '@/types/matching'
export function JobsView({ onCreate }: { onCreate: () => void }) {
  const { jobs, selectedJob, setSelectedJob, openJobWorkspace } = useJob()
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('')
  const { hasRole } = useAuth()
  const [similar, setSimilar] = useState<{ jobId: string; rows: SimilarJob[]; error: boolean } | null>(null)
  const canMatch = hasRole('recruiter')
  const jobId = selectedJob?.id
  useEffect(() => {
    if (!jobId || !canMatch) return
    let live = true
    api.getSimilarJobs(jobId).then(rows => {
      if (live) setSimilar({ jobId, rows, error: false })
    }).catch(() => { if (live) setSimilar({ jobId, rows: [], error: true }) })
    return () => { live = false }
  }, [jobId, canMatch])
  const filtered = jobs.filter(job => (!department || job.department === department) && `${job.id} ${job.title} ${job.department} ${job.location} ${job.description_raw}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <section className="page-stack">
      <div className="page-heading">
        <h1>Jobs</h1>
        <button className="primary-button" disabled={!canMatch} onClick={onCreate}>Create New Job</button>
      </div>
      <JobStatus />
      <div className="panel form-grid">
        <div>
          <label htmlFor="jobs-search">Search jobs</label>
          <input id="jobs-search" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div>
          <label htmlFor="jobs-department">Department</label>
          <select id="jobs-department" value={department} onChange={e => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {[...new Set(jobs.map(j => j.department))].map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
      </div>
      <p role="status">{filtered.length} jobs</p>
      <div className="jobs-grid grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map(job => (
          <article className="panel" key={job.id}>
            <h2>{job.title}</h2>
            <p>{job.id} · {job.department} · {job.location}</p>
            <p>{job.description_raw.slice(0, 200)}</p>
            <div className="modal-actions">
              <button onClick={() => setSelectedJob(job)} disabled={selectedJob?.id === job.id}>
                {selectedJob?.id === job.id ? 'Active requisition' : 'Set as active job'}
              </button>
              <button onClick={() => openJobWorkspace(job)}>Open workspace</button>
            </div>
          </article>
        ))}
      </div>
      {!filtered.length && <p>No jobs match your filters.</p>}
      {jobId && canMatch && (
        <section className="panel">
          <h2>Similar Requisitions</h2>
          {similar?.jobId !== jobId ? <p role="status">Loading similar requisitions…</p>
            : similar.error ? <p role="alert">Could not load similar requisitions.</p>
            : !similar.rows.length ? <p>No similar requisitions found.</p>
            : similar.rows.map(row => (
              <article key={row.job_id}>
                <button className="secondary-button" onClick={() => {
                  const job = jobs.find(j => j.id === row.job_id)
                  if (job) setSelectedJob(job)
                }}>{row.title}</button>
                <p>{row.shared_requirement_count} overlapping requirements</p>
                <p>{row.overlapping_requirements.join(' · ')}</p>
              </article>
            ))}
        </section>
      )}
    </section>
  )
}
