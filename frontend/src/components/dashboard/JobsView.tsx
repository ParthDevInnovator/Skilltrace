import { useEffect, useState } from 'react'
import { useJob } from '@/context/JobContext'
import { JobStatus } from '@/components/common/JobStatus'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/services/api'
import type { SimilarJob } from '@/types/matching'
import { useRankings } from '@/hooks/useRankings'
import { JOB_STATUSES, jobMatchesQuery, type JobLifecycleStatus } from '@/types'
import { JobStatusBadge, STATUS_LABEL } from '@/components/common/JobStatusBadge'

function Icon({ name }: { name: string }) { return <span className="material-symbols-outlined" aria-hidden="true">{name}</span> }
export function JobsView({ onCreate }: { onCreate: () => void }) {
  const { jobs, selectedJob, setSelectedJob, openJobWorkspace } = useJob()
  const { hasRole } = useAuth()
  const canMatch = hasRole('recruiter')
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [status, setStatus] = useState<'all' | JobLifecycleStatus>('all')
  const [similar, setSimilar] = useState<{ jobId: string; rows: SimilarJob[]; error: boolean } | null>(null)
  const jobId = selectedJob?.id
  const jobKey = jobs.map(job => job.id).join('|')
  // Top fit among the candidates added to each job, not the whole pool (OI-30).
  const ranking = useRankings(jobKey ? jobKey.split('|') : [], canMatch, 'applicants')
  const scores: Record<string, number | null> = Object.fromEntries(Object.entries(ranking.byJob).map(([id, job]) => {
    const ready = job.rows.filter(row => row.context_status === 'ready')
    return [id, ready.length ? Math.round(Math.max(...ready.map(row => row.final_score)) * 100) : null]
  }))
  useEffect(() => {
    if (!jobId || !canMatch) return
    let live = true
    api.getSimilarJobs(jobId).then(rows => {
      if (live) setSimilar({ jobId, rows, error: false })
    }).catch(() => { if (live) setSimilar({ jobId, rows: [], error: true }) })
    return () => { live = false }
  }, [jobId, canMatch])
  const countOf = (value: JobLifecycleStatus) => jobs.filter(job => (job.status ?? 'active') === value).length
  const filtered = jobs.filter(job => (status === 'all' || (job.status ?? 'active') === status) && (!department || job.department === department) && jobMatchesQuery(job, query))
  return <section className="jobs-page">
    <div className="jobs-titlebar">
      <div><h1>Jobs</h1><p>Manage hiring requirements and discover candidate capabilities.</p></div>
      <div className="jobs-actions"><button aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}><Icon name="filter_list" />Filter{department ? ' (1)' : ''}</button><button className="jobs-create" disabled={!canMatch} onClick={onCreate}><Icon name="add" />Create New Job</button></div>
    </div>
    <JobStatus />
    {filtersOpen && <div className="jobs-filter-panel"><label htmlFor="jobs-department">Department</label><select id="jobs-department" value={department} onChange={event => setDepartment(event.target.value)}><option value="">All departments</option>{[...new Set(jobs.map(job => job.department))].map(value => <option key={value}>{value}</option>)}</select><button onClick={() => setDepartment('')}>Clear filters</button></div>}
    <div className="jobs-toolbar">
      <div className="jobs-search"><Icon name="search" /><input id="jobs-search" aria-label="Search jobs" placeholder="Search jobs by title, ID, department, skill..." value={query} onChange={event => setQuery(event.target.value)} /></div>
      <div className="jobs-tabs" aria-label="Job status"><button aria-pressed={status === 'all'} onClick={() => setStatus('all')}>All ({jobs.length})</button>{JOB_STATUSES.map(value => <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{STATUS_LABEL[value]} ({countOf(value)})</button>)}</div>
    </div>
    <div className="jobs-card-grid">{filtered.map(job => {
      const score = scores[job.id]
      const employment = job.employment_type ?? job.description_raw.match(/Employment type:\s*([^\n]+)/i)?.[1]
      const counts = job.candidate_counts
      return <article className="job-card" key={job.id}>
        <div className="job-card-heading"><div><h2>{job.title}</h2><p>{[job.department,job.location,employment].filter(Boolean).join(' · ')}</p></div><JobStatusBadge job={job} /></div>
        <div className="job-card-metrics">{([['Candidates', counts?.total], ['Analyzed', counts?.analyzed], ['Processing', counts?.processing]] as const).map(([label, value]) => <div key={label}><strong aria-label={`${label}: ${value ?? 'unknown'}`}>{value ?? '—'}</strong><span>{label}</span></div>)}</div>
        <div className="job-fit-label"><span>Top candidate fit</span><strong>{counts?.total === 0 ? 'No candidates yet' : score == null ? 'Unknown' : `${score} / 100`}</strong></div>
        <div className="job-fit-track" aria-label={score == null ? 'Fit score unavailable' : `Top candidate fit ${score} out of 100`}><span style={{width: `${score ?? 0}%`}} /></div>
        <div className="job-card-footer"><span><Icon name="schedule" />{job.updated_at ? `Updated ${new Date(job.updated_at).toLocaleDateString()}` : job.created_at ? `Created ${new Date(job.created_at).toLocaleDateString()}` : 'No activity recorded'}</span><button aria-label="Open workspace" onClick={() => openJobWorkspace(job)}>Open Workspace<Icon name="arrow_forward" /></button></div>
      </article>
    })}</div>
    {!filtered.length && <p className="jobs-empty">{jobs.length ? 'No jobs match your filters.' : 'No jobs yet. Create a job to start reviewing candidates.'}</p>}
    {ranking.processing && !ranking.exhausted && <p role="status" className="jobs-data-note">Some candidates are still being analyzed. Fit scores update automatically.</p>}
    {ranking.exhausted && <p role="status" className="jobs-data-note">Analysis is taking longer than expected. <button onClick={ranking.refresh}>Refresh fit scores</button></p>}
    {!!jobs.length && <p className="jobs-data-note">Counts and fit scores cover the candidates added to each job. Missing evidence remains unknown.</p>}
    {jobId && canMatch && <details className="jobs-similar"><summary>Similar Requisitions</summary>{similar?.jobId !== jobId ? <p role="status">Loading similar requisitions…</p> : similar.error ? <p role="alert">Could not load similar requisitions.</p> : !similar.rows.length ? <p>No similar requisitions found.</p> : similar.rows.map(row => <article key={row.job_id}><button onClick={() => { const job = jobs.find(item => item.id === row.job_id); if (job) setSelectedJob(job) }}>{row.title}</button><p>{row.shared_requirement_count} overlapping requirements</p><p>{row.overlapping_requirements.join(' · ')}</p></article>)}</details>}
  </section>
}
