import type { ExtractedRequirement, RankedCandidate, SimilarJob, MatchResponse } from '@/types/matching'
import type {
  Job,
  JobFilterParams,
  CandidateSummary,
  CandidateDetail,
  CandidateFilterParams,
  CandidateContext, BuildInProgress, ResumePayload,
} from '@/types'

const API_BASE = '' // Uses Vite proxy in development

export interface HealthResponse {
  status: string
  app_name: string
  version: string
  environment: string
  debug: boolean
  seed_stats?: {
    total_jobs: number
    total_candidates: number
  }
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`
  const response = await fetch(url, {
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options?.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new Error(`API error ${response.status} on ${endpoint}: ${errorBody}`)
  }

  if (response.status === 204) return null as T
  return response.json() as Promise<T>
}

export const api = {
  extractRequirements: (params: {job_id?:string; jd_text?:string}): Promise<ExtractedRequirement[]> => request('/api/v1/jd/extract', {method:'POST',body:JSON.stringify(params)}),
  rankCandidates: (params: {job_id:string; reference_date?:string}): Promise<RankedCandidate[]> => request('/api/v1/jd/rank', {method:'POST',body:JSON.stringify(params)}),
  getSimilarJobs: (job_id:string): Promise<SimilarJob[]> => request('/api/v1/jd/similar', {method:'POST',body:JSON.stringify({job_id})}),
  createJob: (job: {title:string; description_raw:string; department:string; location:string; requirements?:unknown[]}): Promise<Job> => request('/api/v1/jobs',{method:'POST',body:JSON.stringify(job)}),
  getCandidateJdMatch: async (id:string, params:{job_id:string;reference_date?:string}): Promise<MatchResponse> => {
    const response = await fetch(`/api/v1/candidates/${encodeURIComponent(id)}/jd-match`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params)})
    if (response.status === 202) return {status:'building'}
    if (response.status === 503) { const body = await response.json(); return {status:'failed',error:body.error || body.detail || 'Context build failed.'} }
    if (!response.ok) throw new Error('Could not load candidate match.')
    return response.json()
  },
  getHealth: (): Promise<HealthResponse> => request<HealthResponse>('/health'),

  getJobs: (params?: JobFilterParams): Promise<Job[]> => {
    const query = new URLSearchParams()
    if (params?.search) query.set('search', params.search)
    if (params?.department) query.set('department', params.department)
    if (params?.location) query.set('location', params.location)
    const queryString = query.toString() ? `?${query.toString()}` : ''
    return request<Job[]>(`/api/v1/jobs${queryString}`)
  },

  getJobById: (id: string): Promise<Job> => request<Job>(`/api/v1/jobs/${id}`),

  getCandidates: (params?: CandidateFilterParams): Promise<CandidateSummary[]> => {
    const query = new URLSearchParams()
    if (params?.search) query.set('search', params.search)
    if (params?.skill) query.set('skill', params.skill)
    const queryString = query.toString() ? `?${query.toString()}` : ''
    return request<CandidateSummary[]>(`/api/v1/candidates${queryString}`)
  },

  getCandidateContext: (id: string): Promise<CandidateContext | BuildInProgress> =>
    request(`/api/v1/candidates/${encodeURIComponent(id)}/context`),
  getCandidateResume: (id: string): Promise<ResumePayload | null> =>
    request(`/api/v1/candidates/${encodeURIComponent(id)}/resume`),
  resolveCandidates: (params: { name?: string; email?: string }): Promise<CandidateSummary[]> => {
    const query = new URLSearchParams()
    if (params.name) query.set('name', params.name)
    if (params.email) query.set('email', params.email)
    return request(`/api/v1/candidates/resolve?${query}`)
  },
  uploadResume: (data: FormData): Promise<{ candidate_id: string; status: 'building' }> =>
    request('/api/v1/ingest/resume', { method: 'POST', body: data }),
  getCandidateById: (id: string): Promise<CandidateDetail> =>
    request<CandidateDetail>(`/api/v1/candidates/${id}`),
}
