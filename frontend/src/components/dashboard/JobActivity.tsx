import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import type { JobEvent } from '@/types'

const FIELD_NAMES: Record<string, string> = {
  title: 'title', department: 'department', location: 'location', description_raw: 'description', requirements: 'requirements',
  employment_type: 'employment type', experience_range: 'experience range', hiring_manager: 'hiring manager',
}

/** One readable line per event. Candidate events name the ID only; profiles apply their own masking. */
// oxlint-disable-next-line react/only-export-components -- formatter shared with tests.
export function describeEvent(event: JobEvent): string {
  const detail = event.detail ?? {}
  switch (event.kind) {
    case 'created': return `${event.actor_name} created the job${detail.status === 'draft' ? ' as a draft' : ''}`
    case 'updated': {
      const fields = Array.isArray(detail.fields) ? detail.fields.map(name => FIELD_NAMES[String(name)] ?? String(name)) : []
      return `${event.actor_name} edited the ${fields.length ? fields.join(', ') : 'job'}`
    }
    case 'status_changed': return `${event.actor_name} changed the status from ${String(detail.from)} to ${String(detail.to)}`
    case 'candidate_added': return `${event.actor_name} added a candidate${detail.source === 'upload' ? ' by uploading a resume' : ''}`
    case 'candidate_removed': return `${event.actor_name} removed a candidate`
    default: return `${event.actor_name}: ${event.kind.replaceAll('_', ' ')}`
  }
}

/** Job activity feed (OI-31), newest first, from the server's durable event log. */
export function JobActivity({ jobId, onOpenCandidate }: { jobId: string; onOpenCandidate: (id: string) => void }) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ key: string; events: JobEvent[] | null; error: boolean }>({ key: '', events: null, error: false })
  const key = `${jobId}:${attempt}`
  useEffect(() => {
    let live = true
    api.getJobActivity(jobId)
      .then(events => { if (live) setState({ key, events, error: false }) })
      .catch(() => { if (live) setState({ key, events: null, error: true }) })
    return () => { live = false }
  }, [jobId, key])
  const current = state.key === key ? state : null
  return <article className="workspace-description job-activity" aria-labelledby="job-activity-title">
    <h2 id="job-activity-title">Activity</h2>
    {!current ? <p role="status">Loading activity…</p>
      : current.error ? <p role="alert">Could not load job activity. <button onClick={() => setAttempt(value => value + 1)}>Retry activity</button></p>
      : !current.events?.length ? <p>No activity recorded for this job yet.</p>
      : <ol className="job-activity-list">{current.events.map(event => <li key={event.id}>
          <span>{describeEvent(event)}</span>
          {event.candidate_id && event.kind === 'candidate_added' && <button onClick={() => onOpenCandidate(event.candidate_id!)}>View candidate</button>}
          <time dateTime={event.occurred_at}>{new Date(event.occurred_at).toLocaleString()}</time>
        </li>)}</ol>}
  </article>
}
