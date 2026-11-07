import { useEffect, useState } from 'react'
import { useJob } from '@/context/JobContext'
import { JobStatus } from '@/components/common/JobStatus'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/services/api'
import type { SimilarJob } from '@/types/matching'

function Icon({ name }: { name: string }) { return <span className="material-symbols-outlined" aria-hidden="true">{name}</span> }
export function JobsView({ onCreate }: { onCreate: () => void }) {
  const { jobs, selectedJob, setSelectedJob, openJobWorkspace } = useJob()
  const { hasRole } = useAuth()
  const canMatch = hasRole('recruiter')
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [status, setStatus] = useState('all')
  const [scores, setScores] = useState<Record<string, number | null>>({})
  const [similar, setSimilar] = useState<{ jobId: string; rows: SimilarJob[]; error: boolean } | null>(null)
  const jobId = selectedJob?.id
  const jobKey = jobs.map(job => job.id).join('|')
  useEffect(() => {
    if (!canMatch || !jobKey) return
    let live = true
    void Promise.all(jobKey.split('|').map(async id => {
      try {
        const rows = await api.rankCandidates({ job_id: id })
        const ready = rows.filter(row => row.context_status === 'ready')
        return [id, ready.length ? Math.round(Math.max(...ready.map(row => row.final_score)) * 100) : null] as const
      } catch { return [id, null] as const }
    })).then(rows => { if (live) setScores(Object.fromEntries(rows)) })
    return () => { live = false }
  }, [jobKey, canMatch])
  useEffect(() => {
    if (!jobId || !canMatch) return
    let live = true
    api.getSimilarJobs(jobId).then(rows => {
      if (live) setSimilar({ jobId, rows, error: false })
    }).catch(() => { if (live) setSimilar({ jobId, rows: [], error: true }) })
    return () => { live = false }
  }, [jobId, canMatch])
  const filtered = jobs.filter(job => status === 'all' && (!department || job.department === department) && `${job.title} ${job.department} ${job.location} ${job.description_raw}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="jobs-page">
    <div className="jobs-titlebar">
      <div><h1>Jobs</h1><p>Manage hiring requirements and discover candidate capabilities.</p></div>
      <div className="jobs-actions"><button aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}><Icon name="filter_list" />Filter{department ? ' (1)' : ''}</button><button className="jobs-create" disabled={!canMatch} onClick={onCreate}><Icon name="add" />Create New Job</button></div>
    </div>
    <JobStatus />
    {filtersOpen && <div className="jobs-filter-panel"><label htmlFor="jobs-department">Department</label><select id="jobs-department" value={department} onChange={event => setDepartment(event.target.value)}><option value="">All departments</option>{[...new Set(jobs.map(job => job.department))].map(value => <option key={value}>{value}</option>)}</select><button onClick={() => setDepartment('')}>Clear filters</button></div>}
    <div className="jobs-toolbar">
      <div className="jobs-search"><Icon name="search" /><input id="jobs-search" aria-label="Search jobs" placeholder="Search jobs by title, department, skill..." value={query} onChange={event => setQuery(event.target.value)} /></div>
      <div className="jobs-tabs" aria-label="Job status">{[['all', `All (${jobs.length})`], ['active', 'Active (0)'], ['draft', 'Draft (0)']].map(([value,label]) => <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>)}</div>
    </div>
    <div className="jobs-card-grid">{filtered.map(job => {
      const score = scores[job.id]
      const employment = job.description_raw.match(/Employment type:\s*([^\n]+)/i)?.[1]
      return <article className="job-card" key={job.id}>
        <div className="job-card-heading"><div><h2>{job.title}</h2><p>{[job.department,job.location,employment].filter(Boolean).join(' · ')}</p></div><span className="job-status-unknown" title="The API does not provide a job lifecycle status">Status unknown</span></div>
        <div className="job-card-metrics" title="Per-job resume counts are not available from the API">{['Resumes','Analyzed','Processing'].map(label => <div key={label}><strong aria-label={`${label}: unknown`}>—</strong><span>{label}</span></div>)}</div>
        <div className="job-fit-label"><span>Top candidate fit</span><strong>{score == null ? 'Unknown' : `${score} / 100`}</strong></div>
        <div className="job-fit-track" aria-label={score == null ? 'Fit score unavailable' : `Top candidate fit ${score} out of 100`}><span style={{width: `${score ?? 0}%`}} /></div>
        <div className="job-card-footer"><span><Icon name="schedule" />{job.created_at ? `Created ${new Date(job.created_at).toLocaleDateString()}` : 'No activity recorded'}</span><button aria-label="Open workspace" onClick={() => openJobWorkspace(job)}>Open Workspace<Icon name="arrow_forward" /></button></div>
      </article>
    })}</div>
    {!filtered.length && <p className="jobs-empty">{jobs.length ? 'No jobs match your filters.' : 'No jobs yet. Create a job to start reviewing candidates.'}</p>}
    {!!jobs.length && <p className="jobs-data-note">Job status and per-job resume counts are not available yet. Fit scores evaluate the shared candidate pool; missing evidence remains unknown.</p>}
    {jobId && canMatch && <details className="jobs-similar"><summary>Similar Requisitions</summary>{similar?.jobId !== jobId ? <p role="status">Loading similar requisitions…</p> : similar.error ? <p role="alert">Could not load similar requisitions.</p> : !similar.rows.length ? <p>No similar requisitions found.</p> : similar.rows.map(row => <article key={row.job_id}><button onClick={() => { const job = jobs.find(item => item.id === row.job_id); if (job) setSelectedJob(job) }}>{row.title}</button><p>{row.shared_requirement_count} overlapping requirements</p><p>{row.overlapping_requirements.join(' · ')}</p></article>)}</details>}
  </section>
}
