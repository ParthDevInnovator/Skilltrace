export type EvidenceTier = 'None' | 'Limited' | 'Some' | 'Good' | 'Strong'

export interface MatchPreview {
  fit_score: number
  evidence_label: EvidenceTier
}

export interface CandidateSummary {
  id: string
  full_name: string
  email: string
  headline: string
  location: string
  top_skills: string[]
  match_preview?: MatchPreview
}
