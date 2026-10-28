"""Deterministic requirement matching contracts."""
from datetime import date, timezone
from enum import Enum
from typing import Annotated, Literal
from pydantic import BaseModel, Field, AwareDatetime, field_validator
from backend.models.candidate import EvidenceLabel
Score = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]


class ExtractedRequirement(BaseModel):
    id: str
    requirement_text: str
    normalized_text: str
    category: Literal['Backend','Frontend','Cloud','Database','API','Leadership','Domain','Other'] = 'Other'
    is_mandatory: bool = True
    skill_aliases: list[str] = Field(default_factory=list)


class CoverageState(str, Enum):
    MATCHED = 'matched'
    PARTIALLY_SUPPORTED = 'partially_supported'
    INSUFFICIENT_EVIDENCE = 'insufficient_evidence'
    NOT_ASSESSED = 'not_assessed'


class RequirementCoverage(BaseModel):
    requirement_id: str
    coverage_state: CoverageState
    claim_ids: list[str] = Field(default_factory=list)
    evidence_record_ids: list[str] = Field(default_factory=list)
    coverage_weight: Score
    evidence_strength: Score = 0
    observation: str


class CandidateMatchResult(BaseModel):
    candidate_id: str
    job_id: str
    reference_date: date
    resume_fit: Score
    evidence_strength: Score
    final_score: Score
    coverage: list[RequirementCoverage]
    result_built_at: AwareDatetime
    @field_validator('result_built_at')
    @classmethod
    def utc_timestamp(cls, value):
        return value.astimezone(timezone.utc)

class RankedCandidate(BaseModel):
    candidate_id: str
    full_name: str
    headline: str
    resume_fit: Score
    evidence_strength: Score
    final_score: Score
    evidence_label: EvidenceLabel
    coverage_counts: dict[CoverageState, int]
    coverage: list[RequirementCoverage]
    context_status: Literal['ready','building','failed'] = 'ready'


class SimilarJob(BaseModel):
    job_id: str
    title: str
    shared_requirement_count: int = Field(ge=0)
    overlapping_requirements: list[str]
    overlap_ratio: Score
