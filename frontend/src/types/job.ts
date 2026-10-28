import type { ExtractedRequirement } from './matching'
export interface Job {
  requirements?: Pick<ExtractedRequirement, 'id' | 'requirement_text' | 'category' | 'is_mandatory'>[]
  extraction_failed?: boolean
  id: string
  title: string
  department: string
  location: string
  description_raw: string
  created_at?: string
  requirements_preview?: string[]
}

export interface JobFilterParams {
  search?: string
  department?: string
  location?: string
}
