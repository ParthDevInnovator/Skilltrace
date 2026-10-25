import type { Job, JobFilterParams, CandidateSummary } from '@/types'

const API_BASE = '' // Uses Vite proxy in development

export interface HealthResponse {
  status: string
  app_name: string
  version: string
  environment: string
  debug: boolean
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new Error(`API error ${response.status} on ${endpoint}: ${errorBody}`)
  }

  return response.json() as Promise<T>
}

export const api = {
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

  getCandidates: (): Promise<CandidateSummary[]> =>
    request<CandidateSummary[]>('/api/v1/candidates'),

  getCandidateById: (id: string): Promise<CandidateSummary> =>
    request<CandidateSummary>(`/api/v1/candidates/${id}`),
}
