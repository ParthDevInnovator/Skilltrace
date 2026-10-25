export interface Job {
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
