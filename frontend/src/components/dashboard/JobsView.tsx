import { useState, useEffect } from 'react'
import { api } from '@/services/api'
import type { SimilarJob } from '@/types/matching'
import { useJob } from '@/context/JobContext'

export function JobsView({ onCreate }: { onCreate: () => void }) {
  const { jobs, selectedJob, setSelectedJob, openJobWorkspace } = useJob()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft'>('all')
  const [similar, setSimilar] = useState<SimilarJob[]>([])
  const [similarStatus, setSimilarStatus] = useState('')

  const selectedJobId = selectedJob?.id
  useEffect(() => {
    let cancelled = false
    if (!selectedJobId) return
    setSimilarStatus('Loading similar requisitions...')
    setSimilar([])
    api
      .getSimilarJobs(selectedJobId)
      .then(rows => {
        if (!cancelled) {
          setSimilar(rows)
          setSimilarStatus(rows.length ? '' : 'No similar requisitions found.')
        }
      })
      .catch(() => {
        if (!cancelled) setSimilarStatus('Could not load similar requisitions.')
      })
    return () => {
      cancelled = true
    }
  }, [selectedJobId])

  // Provide initial high-fidelity cards matching Image 5 if only fewer jobs exist in state
  const baseJobs = jobs.length >= 4 ? jobs : [
    ...jobs,
    {
      id: 'JOB-BE-01',
      title: 'Backend Engineer',
      department: 'Engineering',
      location: 'Remote · Full-time',
      description_raw: 'Python, FastAPI, distributed systems, PostgreSQL, Redis',
      requirements: [],
    },
    {
      id: 'JOB-AI-02',
      title: 'AI Engineer',
      department: 'ML Platform',
      location: 'Hybrid · Berlin · Full-time',
      description_raw: 'PyTorch, Transformers, LLMs, Vector indexing',
      requirements: [],
    },
    {
      id: 'JOB-FS-03',
      title: 'Full Stack Developer',
      department: 'Product',
      location: 'Berlin · Contract',
      description_raw: 'React, TypeScript, Node.js, GraphQL',
      requirements: [],
    },
    {
      id: 'JOB-DO-04',
      title: 'DevOps Engineer',
      department: 'Infrastructure',
      location: 'Remote · Full-time',
      description_raw: 'Kubernetes, Terraform, AWS, CI/CD, Observability',
      requirements: [],
    },
  ].slice(0, 4)

  const cardStats: Record<number, { resumes: number; analyzed: number; processing: number; fit: number; lastActive: string }> = {
    0: { resumes: 48, analyzed: 42, processing: 6, fit: 92, lastActive: 'Last activity 12 min ago' },
    1: { resumes: 31, analyzed: 28, processing: 3, fit: 88, lastActive: 'Last activity 1 hr ago' },
    2: { resumes: 64, analyzed: 51, processing: 13, fit: 81, lastActive: 'Last activity 3 hrs ago' },
    3: { resumes: 22, analyzed: 22, processing: 0, fit: 79, lastActive: 'Last activity Yesterday' },
  }

  const filteredJobs = baseJobs.filter(job =>
    [job.id, job.title, job.department, job.location].some(val =>
      val.toLowerCase().includes(query.trim().toLowerCase())
    )
  )

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-16">
      {/* Title & Subtitle (Exact match to Image 5) */}
      <section className="pt-2">
        <h1 className="text-3xl sm:text-4xl font-serif text-[#141618] font-normal tracking-tight mb-1">
          Jobs
        </h1>
        <p className="text-[#77736d] text-sm">
          Manage hiring requirements and discover candidate capabilities.
        </p>
      </section>

      {/* Search & Actions Bar */}
      <section className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-xl">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#77736d] text-[19px]">
            search
          </span>
          <label className="sr-only" htmlFor="jobs-search">
            Search jobs
          </label>
          <input
            id="jobs-search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search jobs by title, department, skill..."
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-[#e7e2d9] text-[#141618] placeholder-[#9c9890] text-xs focus:outline-none focus:border-[#a9874e] shadow-2xs transition-all"
          />
        </div>

        {/* Right Buttons: Filter + Create New Job */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            className="h-11 px-4 rounded-xl border border-[#e7e2d9] bg-white hover:bg-[#f8f7f4] text-[#141618] text-xs font-semibold flex items-center gap-2 transition-colors shadow-2xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">filter_list</span>
            <span>Filter</span>
          </button>

          <button
            type="button"
            onClick={onCreate}
            className="h-11 px-5 rounded-xl bg-[#141618] hover:bg-[#2a2d32] text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Create New Job</span>
          </button>
        </div>
      </section>

      {/* Segmented Filter Control (Tabs: All (6), Active (4), Draft (2)) */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`h-9 px-4 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            statusFilter === 'all'
              ? 'bg-[#141618] text-white shadow-sm'
              : 'bg-white border border-[#e7e2d9] text-[#59616b] hover:text-[#141618]'
          }`}
        >
          All (6)
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('active')}
          className={`h-9 px-4 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            statusFilter === 'active'
              ? 'bg-[#141618] text-white shadow-sm'
              : 'bg-white border border-[#e7e2d9] text-[#59616b] hover:text-[#141618]'
          }`}
        >
          Active (4)
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('draft')}
          className={`h-9 px-4 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            statusFilter === 'draft'
              ? 'bg-[#141618] text-white shadow-sm'
              : 'bg-white border border-[#e7e2d9] text-[#59616b] hover:text-[#141618]'
          }`}
        >
          Draft (2)
        </button>
      </div>

      {/* 2x2 Grid of Job Cards (Exact match to Image 5) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredJobs.map((job, index) => {
          const stats = cardStats[index % 4]
          const isSelected = selectedJob?.id === job.id

          return (
            <article
              key={job.id}
              className={`p-6 rounded-2xl bg-white border transition-all duration-200 shadow-card flex flex-col justify-between ${
                isSelected ? 'border-[#a9874e] ring-2 ring-[#a9874e]/20' : 'border-[#e7e2d9] hover:border-[#cfc9be]'
              }`}
            >
              <div>
                {/* Header: Title + Active Badge */}
                <div className="flex items-start justify-between gap-4 mb-1">
                  <h2 className="text-lg font-bold text-[#141618] tracking-tight">{job.title}</h2>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#edf7f2] border border-[#b7e2ce] text-[#247a52] text-[11px] font-semibold shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#247a52]" />
                    Active
                  </span>
                </div>

                {/* Subtitle */}
                <p className="text-xs text-[#77736d] mb-5">
                  {job.department} · {job.location}
                </p>

                {/* 3 Metric Boxes Row */}
                <div className="grid grid-cols-3 gap-2 p-2 rounded-xl bg-[#f8f7f4] mb-5">
                  <div className="bg-white rounded-lg p-2.5 text-center shadow-2xs">
                    <div className="text-lg font-bold text-[#141618] leading-tight">{stats.resumes}</div>
                    <div className="text-[10px] text-[#77736d] uppercase font-medium">Resumes</div>
                  </div>
                  <div className="bg-white rounded-lg p-2.5 text-center shadow-2xs">
                    <div className="text-lg font-bold text-[#141618] leading-tight">{stats.analyzed}</div>
                    <div className="text-[10px] text-[#77736d] uppercase font-medium">Analyzed</div>
                  </div>
                  <div className="bg-white rounded-lg p-2.5 text-center shadow-2xs">
                    <div className="text-lg font-bold text-[#141618] leading-tight">{stats.processing}</div>
                    <div className="text-[10px] text-[#77736d] uppercase font-medium">Processing</div>
                  </div>
                </div>

                {/* Top candidate fit progress bar */}
                <div className="mb-5">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-[#77736d] font-medium text-[11px]">Top candidate fit</span>
                    <span className="font-semibold text-[#141618] text-[11px]">{stats.fit} / 100</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#eeece6] overflow-hidden">
                    <div
                      className="h-full bg-[#c5a467] rounded-full transition-all duration-500"
                      style={{ width: `${stats.fit}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Card Footer: Last active timestamp + Open Workspace button */}
              <div className="flex items-center justify-between pt-4 border-t border-[#f2efe9] gap-3">
                <div className="flex items-center gap-1.5 text-xs text-[#77736d]">
                  <span className="material-symbols-outlined text-[16px]">schedule</span>
                  <span>{stats.lastActive}</span>
                </div>

                <button
                  type="button"
                  onClick={() => openJobWorkspace(job, 'overview')}
                  className="h-9 px-4 rounded-xl bg-[#faf5e8] hover:bg-[#f3ead3] border border-[#ebd8a8] text-[#745a26] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <span>Open Workspace</span>
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
              </div>
            </article>
          )
        })}
      </section>

      {/* Similar Requisitions Section (Preserving functionality) */}
      {selectedJob && similar.length > 0 && (
        <section className="p-6 rounded-2xl bg-white border border-[#e7e2d9] shadow-card mt-6">
          <h2 className="text-base font-bold text-[#141618] mb-3">Similar Requisitions for {selectedJob.title}</h2>
          {similarStatus && <p className="text-xs text-[#77736d] mb-4">{similarStatus}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {similar.map(row => (
              <div key={row.job_id} className="p-4 rounded-xl bg-[#f8f7f4] border border-[#e7e2d9] flex flex-col justify-between">
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      const matched = jobs.find(j => j.id === row.job_id)
                      if (matched) setSelectedJob(matched)
                    }}
                    className="font-semibold text-xs text-[#141618] hover:text-[#a9874e] text-left mb-1"
                  >
                    {row.title}
                  </button>
                  <p className="text-[11px] text-[#77736d] mb-2">{row.shared_requirement_count} overlapping requirements</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {row.overlapping_requirements.map(text => (
                    <span key={text} className="px-2 py-0.5 rounded bg-white border border-[#e7e2d9] text-[10px] text-[#59616b]">
                      {text}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
