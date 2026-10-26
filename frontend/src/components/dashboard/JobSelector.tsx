import { useEffect, useRef, useState } from 'react'
import { useJob } from '@/context/JobContext'
import { JobStatus } from '@/components/common/JobStatus'
export function JobSelector({ onOpenCustomJDModal }: { onOpenCustomJDModal: () => void }) {
  const { jobs, selectedJob, setSelectedJob, isLoadingJobs } = useJob()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!isOpen) return
    search.current?.focus()
    const outside = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setIsOpen(false) }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [isOpen])
  const close = () => { setIsOpen(false); trigger.current?.focus() }
  const filtered = jobs.filter(j => [j.id, j.title, j.department, j.location].some(value => value.toLowerCase().includes(query.trim().toLowerCase())))
  return <div className="job-selector" ref={root} onKeyDown={e => {
    if (e.key === 'Escape') { e.stopPropagation(); close() }
    if (isOpen && ['ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault()
      const items = Array.from(root.current?.querySelectorAll<HTMLElement>('.job-popover input, .job-popover button') || [])
      const index = items.indexOf(document.activeElement as HTMLElement)
      items[(index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
    }
  }}>
    <button ref={trigger} aria-expanded={isOpen} aria-controls="job-picker" onClick={() => setIsOpen(v => !v)} className="job-trigger">{selectedJob?.title || (isLoadingJobs ? 'Loading jobs...' : 'Select Active Job...')} <span aria-hidden="true">v</span></button>
    {isOpen && <section id="job-picker" aria-label="Choose active job" className="job-popover">
      <label htmlFor="job-search">Find a job</label><input ref={search} id="job-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ID, title, department or location" />
      <JobStatus />
      <div className="job-options">{filtered.map(job => <button key={job.id} aria-pressed={selectedJob?.id === job.id} onClick={() => { setSelectedJob(job); close() }}><strong>{job.title}</strong><small>{job.id} - {job.department} - {job.location}</small></button>)}{!isLoadingJobs && !filtered.length && <p>No jobs match your search.</p>}</div>
      <button onClick={() => { setSelectedJob(null); close() }}>Clear selection</button>
      <button className="primary-button" onClick={() => { close(); onOpenCustomJDModal() }}>Input Custom JD Text</button>
    </section>}
  </div>
}
