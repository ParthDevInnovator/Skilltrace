import type { EvidenceLabel } from './candidate'
export type CoverageState = 'matched' | 'partially_supported' | 'insufficient_evidence' | 'not_assessed'
export interface ExtractedRequirement { id: string; requirement_text: string; normalized_text: string; category: 'Backend' | 'Frontend' | 'Cloud' | 'Database' | 'API' | 'Leadership' | 'Domain' | 'Other'; is_mandatory: boolean; skill_aliases: string[] }
export interface RequirementCoverage { requirement_id: string; coverage_state: CoverageState; claim_ids: string[]; evidence_record_ids: string[]; coverage_weight: number; evidence_strength: number; observation: string }
export interface CandidateMatchResult { candidate_id: string; job_id: string; reference_date: string; resume_fit: number; evidence_strength: number; final_score: number; coverage: RequirementCoverage[]; result_built_at: string }
export interface RankedCandidate { candidate_id: string; full_name: string; headline: string; resume_fit: number; evidence_strength: number; final_score: number; evidence_label: EvidenceLabel; coverage_counts: Record<CoverageState,number>; coverage: RequirementCoverage[]; context_status: 'ready' | 'building' | 'failed' }
export interface SimilarJob { job_id: string; title: string; shared_requirement_count: number; overlapping_requirements: string[]; overlap_ratio: number }
export type MatchResponse = CandidateMatchResult | {status:'building'} | {status:'failed';error:string}
