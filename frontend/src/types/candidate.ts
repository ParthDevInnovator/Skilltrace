export type EvidenceLabel =
  | 'No public evidence'
  | 'Limited'
  | 'Some'
  | 'Good'
  | 'Strong'

// Backward-compatibility alias
export type EvidenceTier = EvidenceLabel | 'None'

export interface MatchPreview {
  fit_score: number
  evidence_label: EvidenceLabel
}

export interface CandidateSummary {
  id: string
  full_name: string
  email: string
  headline: string
  location: string
  top_skills: string[]
  resume_path?: string | null
  match_preview?: MatchPreview | null
}

export interface ExternalIdentifiers {
  github?: string | null
  linkedin?: string | null
  leetcode?: string | null
}

export interface CandidateDetail extends CandidateSummary {
  summary?: string | null
  experience_years?: number | null
  external_identifiers?: ExternalIdentifiers | null
  claims_preview: string[]
}

export interface CandidateFilterParams {
  search?: string
  skill?: string
}
