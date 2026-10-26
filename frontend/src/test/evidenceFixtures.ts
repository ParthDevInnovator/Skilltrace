import type { CandidateContext, EvidenceRecord } from '@/types/context'
export const exampleRecord: EvidenceRecord = {
  id: 'OBS-1', candidate_id: 'CAND-001', skill: 'Python', source_type: 'linkedin',
  source_url: 'https://example.test/synthetic-profile', observation: 'Synthetic headline mentions Python',
  base_weight: 1, recency_multiplier: .7, computed_weight: .7, observation_date: null,
  reference_date: '2026-10-26', provenance: 'synthetic \u2014 linkedin stub',
}
export const exampleContext: CandidateContext = {
  candidate: { id: 'CAND-001', full_name: 'Alex Chen', email: 'alex@example.com', headline: 'Backend Engineer', location: 'Remote', top_skills: ['Python'], claims_preview: ['Built Python services'], summary: 'API developer' },
  claims: [{ id: 'CLAIM-1', candidate_id: 'CAND-001', claim_text: 'Built Python services', section: 'Experience', skill: 'Python', extraction_trigger: 'Built', provenance: 'Rule-based test fixture', verification_state: 'unverified' }],
  evidence_records: [exampleRecord], evidence_score: .7, evidence_label: 'Limited', resume_text: 'Synthetic resume text', parse_source: 'stub',
  application_history: [], interview_feedback: [], reference_date: '2026-10-26', context_built_at: '2026-10-26T12:00:00Z',
}
