import type { Job, JobLifecycleStatus } from '@/types'

// oxlint-disable-next-line react/only-export-components -- label map shared with the status menu.
export const STATUS_LABEL: Record<JobLifecycleStatus, string> = { active: 'Active', draft: 'Draft', closed: 'Closed', archived: 'Archived' }

/** Job lifecycle status (OI-31). Jobs from before lifecycle existed are active. */
export function JobStatusBadge({ job }: { job: Pick<Job, 'status'> }) {
  const status = job.status ?? 'active'
  return <span className={`job-status-badge job-status-${status}`}>{STATUS_LABEL[status]}</span>
}
