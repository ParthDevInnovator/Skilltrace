import type { ExtractedRequirement } from './matching'

export type JobLifecycleStatus = 'draft' | 'active' | 'closed' | 'archived'
export const JOB_STATUSES: JobLifecycleStatus[] = ['active', 'draft', 'closed', 'archived']
/** Candidates can be added while a job is a draft or open (OI-30). */
export const isOpenJob = (job: Pick<Job, 'status'> | null | undefined) => !job?.status || job.status === 'draft' || job.status === 'active'

export type JobRequirementItem = Pick<ExtractedRequirement, 'id' | 'requirement_text' | 'is_mandatory'> & { category?: ExtractedRequirement['category'] | null }

export interface JobCandidateCounts { total: number; analyzed: number; processing: number; failed: number }

export interface Job {
  requirements?: JobRequirementItem[]
  extraction_failed?: boolean
  id: string
  title: string
  department: string
  location: string
  description_raw: string
  created_at?: string
  updated_at?: string | null
  requirements_preview?: string[]
  status?: JobLifecycleStatus
  is_custom?: boolean
  employment_type?: string | null
  experience_range?: string | null
  hiring_manager?: string | null
  candidate_counts?: JobCandidateCounts | null
}

export interface JobFields {
  title: string
  department: string
  location: string
  description_raw: string
  employment_type?: string | null
  experience_range?: string | null
  hiring_manager?: string | null
}

export interface JobCreateRequest extends JobFields {
  requirements: { id: string; requirement_text: string; category?: string | null; is_mandatory: boolean }[]
  status?: 'draft' | 'active'
}

export type JobUpdateRequest = Partial<JobFields> & {
  requirements?: JobCreateRequest['requirements']
  status?: JobLifecycleStatus
}

export interface JobEvent {
  id: string
  job_id: string
  kind: 'created' | 'updated' | 'status_changed' | 'candidate_added' | 'candidate_removed' | string
  actor_name: string
  candidate_id?: string | null
  detail: Record<string, unknown>
  occurred_at: string
}

export interface JobCandidate {
  candidate_id: string
  added_at: string
  source: 'upload' | 'manual' | string
  context_status?: 'building' | 'ready' | 'failed' | null
}

export interface JobFilterParams {
  search?: string
  department?: string
  location?: string
}

/** Local search over the same fields as the backend search: ID, text fields and requirements (OI-31). */
export function jobMatchesQuery(job: Job, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [job.id, job.title, job.department, job.location, job.description_raw, job.employment_type, job.hiring_manager,
    ...(job.requirements_preview ?? []), ...(job.requirements ?? []).map(r => r.requirement_text)]
    .filter(Boolean).join(' ').toLowerCase().includes(q)
}
