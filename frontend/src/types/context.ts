import type { CandidateDetail, EvidenceLabel } from './candidate'
export type ParseSource = 'pdf' | 'docx' | 'txt' | 'stub' | 'empty'
export type SourceType = 'github' | 'leetcode' | 'linkedin' | 'interview_feedback' | 'project_submission'
export interface ResumeClaim {
  id: string; candidate_id: string; claim_text: string; section: string; skill: string | null
  extraction_trigger: string; provenance: string
  /** Taxonomy name for skill, the join key across screens (OI-12). */
  canonical_skill?: string | null
  verification_state: 'unverified' | 'supported' | 'contradicted'
}
export interface EvidenceRecord {
  id: string; candidate_id: string; skill: string; source_type: SourceType; source_url: string
  observation: string; base_weight: number; recency_multiplier: number; computed_weight: number
  observation_date: string | null; reference_date: string; provenance: string
  canonical_skill?: string | null
}
export interface CandidateContext {
  candidate: CandidateDetail; claims: ResumeClaim[]; evidence_records: EvidenceRecord[]
  evidence_score: number; evidence_label: EvidenceLabel; resume_text: string; parse_source: ParseSource
  application_history: { id: string; job_id: string; applied_at: string | null; outcome: string | null }[]
  interview_feedback: { id: string; feedback: string; interview_date: string | null; job_id: string | null; skill: string | null }[]
  reference_date: string; context_built_at: string
  /** Sources that could not be read for this build: an outage to retry, not missing evidence (OI-19). */
  unavailable_sources?: SourceType[]
  /** Measured build steps (OI-28); absent for contexts built before stages were recorded. */
  build_stages?: BuildStage[]
}
export type BuildStageName = 'resume_parse' | 'claim_extraction' | 'github' | 'leetcode' | 'linkedin' | 'scoring'
export interface BuildStage { name: BuildStageName; state: 'pending' | 'running' | 'complete' | 'skipped' | 'unavailable' | 'failed'; started_at: string | null; finished_at: string | null; item_count: number | null }
export interface BuildInProgress { candidate_id: string; status: 'building'; stages?: BuildStage[] }
export interface ResumePayload { candidate_id: string; raw_text: string; source: ParseSource; char_count: number }
export const EVIDENCE_LABELS: EvidenceLabel[] = ['No public evidence', 'Limited', 'Some', 'Good', 'Strong']
export function labelForScore(score: number): EvidenceLabel {
  return score === 0 ? 'No public evidence' : score <= 2 ? 'Limited' : score <= 5 ? 'Some' : score <= 9 ? 'Good' : 'Strong'
}
const SOURCE_NAMES: Record<SourceType, string> = {
  github: 'GitHub', leetcode: 'LeetCode', linkedin: 'LinkedIn',
  interview_feedback: 'Interview feedback', project_submission: 'Project submission',
}
export function sourceNames(sources: readonly SourceType[]): string {
  return sources.map(source => SOURCE_NAMES[source] ?? source).join(', ')
}
/** "No public evidence" is only a finding when every source was actually read. */
export function displayEvidenceLabel(context: Pick<CandidateContext, 'evidence_label' | 'unavailable_sources'>): string {
  return context.evidence_label === 'No public evidence' && context.unavailable_sources?.length
    ? 'Sources unavailable' : context.evidence_label
}
export function provenanceSummary(records: EvidenceRecord[], unavailable: readonly SourceType[] = []): string {
  const outage = unavailable.length ? `${sourceNames(unavailable)} could not be reached - retry later` : ''
  if (!records.length) return outage || 'No public evidence available'
  const synthetic = records.filter(record => record.provenance.startsWith('synthetic')).length
  const summary = synthetic === records.length ? 'Synthetic evidence fixtures - not live verification'
    : synthetic ? 'External signals and synthetic fixtures - inspect provenance' : 'Evidence from external signals - claims remain separately assessed'
  return outage ? `${summary}. ${outage}` : summary
}
