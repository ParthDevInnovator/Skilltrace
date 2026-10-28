"""Pure matching; never changes claim verification."""
from backend.models import ResumeClaim, EvidenceRecord
from backend.models.matching import CoverageState, ExtractedRequirement
from backend.services.taxonomy import resolve_skill, skills_for_requirement
MATCHED_CLAIM = .5
MATCHED_EVIDENCE = .3
PARTIAL_CLAIM = .25
PARTIAL_EVIDENCE = .15
COVERAGE_WEIGHTS = {CoverageState.MATCHED:1., CoverageState.PARTIALLY_SUPPORTED:.5, CoverageState.INSUFFICIENT_EVIDENCE:.1, CoverageState.NOT_ASSESSED:0.}


def match_claims_to_requirement(requirement: ExtractedRequirement, claims: list[ResumeClaim]) -> tuple[list[str], float]:
    eligible = [c for c in claims if c.verification_state != 'contradicted']
    ids = sorted(c.id for c in eligible if set(requirement.skill_aliases) & (set(skills_for_requirement(c.claim_text)) | {resolve_skill(c.skill or '')}))
    return ids, len(ids)/len(eligible) if eligible else 0.


def match_evidence_to_requirement(requirement: ExtractedRequirement, records: list[EvidenceRecord]) -> tuple[list[str], float]:
    matches = sorted((r for r in records if resolve_skill(r.skill) in requirement.skill_aliases), key=lambda r:r.id)
    return [r.id for r in matches], min(1., sum(r.computed_weight for r in matches if not (r.source_type == 'interview_feedback' and r.base_weight == 0))/9.)


def classify_coverage(claim_ratio: float, evidence_strength: float) -> CoverageState:
    if claim_ratio >= MATCHED_CLAIM and evidence_strength >= MATCHED_EVIDENCE: return CoverageState.MATCHED
    if claim_ratio >= PARTIAL_CLAIM or evidence_strength >= PARTIAL_EVIDENCE: return CoverageState.PARTIALLY_SUPPORTED
    if claim_ratio > 0 or evidence_strength > 0: return CoverageState.INSUFFICIENT_EVIDENCE
    return CoverageState.NOT_ASSESSED


def generate_observation(requirement: ExtractedRequirement, coverage_state: CoverageState, claim_count: int, evidence_count: int) -> str:
    templates = {CoverageState.MATCHED:'Supported by resume claims and external observations', CoverageState.PARTIALLY_SUPPORTED:'Partially supported; further assessment is needed', CoverageState.INSUFFICIENT_EVIDENCE:'Limited support; evidence remains insufficient', CoverageState.NOT_ASSESSED:'Not assessed; no matching support is available'}
    return f'{requirement.requirement_text} ({requirement.category}): {templates[coverage_state]} ({claim_count} claims, {evidence_count} observations).'
