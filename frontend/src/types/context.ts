import type { CandidateDetail, EvidenceLabel } from './candidate'
export type ParseSource = 'pdf' | 'docx' | 'txt' | 'stub' | 'empty'
export type SourceType = 'github' | 'leetcode' | 'linkedin' | 'interview_feedback' | 'project_submission'
export interface ResumeClaim {
  id: string; candidate_id: string; claim_text: string; section: string; skill: string | null
  extraction_trigger: string; provenance: string
  verification_state: 'unverified' | 'supported' | 'contradicted'
}
export interface EvidenceRecord {
  id: string; candidate_id: string; skill: string; source_type: SourceType; source_url: string
  observation: string; base_weight: number; recency_multiplier: number; computed_weight: number
  observation_date: string | null; reference_date: string; provenance: string
}
export interface CandidateContext {
  candidate: CandidateDetail; claims: ResumeClaim[]; evidence_records: EvidenceRecord[]
  evidence_score: number; evidence_label: EvidenceLabel; resume_text: string; parse_source: ParseSource
  application_history: { id: string; job_id: string; applied_at: string | null; outcome: string | null }[]
  interview_feedback: { id: string; feedback: string; interview_date: string | null; job_id: string | null; skill: string | null }[]
  reference_date: string; context_built_at: string
}
export interface BuildInProgress { candidate_id: string; status: 'building' }
export interface ResumePayload { candidate_id: string; raw_text: string; source: ParseSource; char_count: number }
export const EVIDENCE_LABELS: EvidenceLabel[] = ['No public evidence', 'Limited', 'Some', 'Good', 'Strong']
export function labelForScore(score: number): EvidenceLabel {
  return score === 0 ? 'No public evidence' : score <= 2 ? 'Limited' : score <= 5 ? 'Some' : score <= 9 ? 'Good' : 'Strong'
}
export function provenanceSummary(records: EvidenceRecord[]): string {
  if (!records.length) return 'No public evidence available'
  const synthetic = records.filter(record => record.provenance.startsWith('synthetic')).length
  if (synthetic === records.length) return 'Synthetic evidence fixtures - not live verification'
  return synthetic ? 'External signals and synthetic fixtures - inspect provenance' : 'Evidence from external signals - claims remain separately assessed'
}
