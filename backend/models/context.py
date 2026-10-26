"""Structured claims, evidence observations and canonical candidate contexts."""

import json
import math
from datetime import date, timezone
from enum import Enum
from typing import Annotated
from uuid import NAMESPACE_URL, uuid5

from pydantic import (
    AwareDatetime, BaseModel, ConfigDict, Field, HttpUrl,
    StringConstraints, field_validator, model_validator,
)

from backend.models.candidate import CandidateDetail, EvidenceLabel


NonBlankString = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class ClaimSection(str, Enum):
    EXPERIENCE = "Experience"
    PROJECTS = "Projects"
    EDUCATION = "Education"
    UNKNOWN = "Unknown"


class ClaimVerificationState(str, Enum):
    UNVERIFIED = "unverified"
    SUPPORTED = "supported"
    CONTRADICTED = "contradicted"


class ResumeClaim(BaseModel):
    """A reported claim; evidence presence alone never changes its state.

    Generated IDs are deterministic for the candidate, section and normalized
    claim text. Re-extraction with different skill/provenance metadata keeps
    the same ID. Persisted IDs may also be supplied explicitly.
    """

    model_config = ConfigDict(extra="forbid", validate_assignment=True)

    id: NonBlankString = Field(description="Stable unique claim identifier")
    candidate_id: NonBlankString = Field(description="Candidate that made the claim")
    claim_text: NonBlankString = Field(description="Original extracted claim text")
    extraction_trigger: NonBlankString = Field(
        description="Action verb or keyword that triggered extraction"
    )
    section: ClaimSection = Field(description="Resume section, or Unknown if unavailable")
    skill: NonBlankString | None = Field(
        default=None, description="Associated skill, if identifiable"
    )
    provenance: NonBlankString = Field(description="How the claim was extracted")
    verification_state: ClaimVerificationState = Field(
        default=ClaimVerificationState.UNVERIFIED,
        description="Explicit assessment; never inferred from evidence presence",
    )

    @model_validator(mode="before")
    @classmethod
    def assign_stable_id(cls, value):
        if not isinstance(value, dict) or "id" in value:
            return value
        candidate_id = value.get("candidate_id")
        claim_text = value.get("claim_text")
        section = value.get("section")
        if not all(isinstance(item, str) and item.strip() for item in (candidate_id, claim_text, section)):
            return value  # Let normal field validation report missing/invalid data.
        identity = json.dumps(
            [candidate_id.strip(), section, " ".join(claim_text.split()).casefold()],
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return {**value, "id": f"CLAIM-{uuid5(NAMESPACE_URL, identity)}"}


class EvidenceSourceType(str, Enum):
    GITHUB = "github"
    LEETCODE = "leetcode"
    LINKEDIN = "linkedin"
    INTERVIEW_FEEDBACK = "interview_feedback"
    PROJECT_SUBMISSION = "project_submission"


class EvidenceProvenance(str, Enum):
    LIVE = "live"
    DISK_CACHE = "disk_cache"
    SYNTHETIC = "synthetic \u2014 controlled test fixture"
    LINKEDIN_STUB = "synthetic \u2014 linkedin stub"


class ResumeParseSource(str, Enum):
    PDF = "pdf"
    DOCX = "docx"
    TXT = "txt"
    STUB = "stub"
    EMPTY = "empty"


NonNegativeScore = Annotated[float, Field(ge=0, allow_inf_nan=False)]


class EvidenceRecord(BaseModel):
    """An attributed observation, independent of a claim's verification state.

    IDs identify observations, so refreshing cache/provenance or recomputing
    recency does not create a different record. Weights are validated here;
    the later scoring service is responsible for choosing them.
    """

    model_config = ConfigDict(extra="forbid", validate_assignment=True)

    id: NonBlankString
    candidate_id: NonBlankString
    skill: NonBlankString
    source_type: EvidenceSourceType
    source_url: HttpUrl
    observation: NonBlankString
    base_weight: NonNegativeScore
    recency_multiplier: float = Field(ge=0, le=1, allow_inf_nan=False)
    computed_weight: NonNegativeScore
    observation_date: date | None = None
    reference_date: date
    provenance: EvidenceProvenance

    @model_validator(mode="after")
    def validate_weight_formula(self):
        expected = self.base_weight * self.recency_multiplier
        if not math.isclose(self.computed_weight, expected, rel_tol=1e-9, abs_tol=1e-9):
            raise ValueError("computed_weight must equal base_weight * recency_multiplier")
        return self

    @model_validator(mode="before")
    @classmethod
    def assign_stable_id(cls, value):
        if not isinstance(value, dict) or "id" in value:
            return value
        keys = ("candidate_id", "skill", "source_type", "source_url", "observation")
        if any(key not in value for key in keys):
            return value
        normalized = dict(value)
        source_type = normalized["source_type"]
        if isinstance(source_type, Enum):
            normalized["source_type"] = source_type.value
        try:
            normalized["source_url"] = str(HttpUrl(normalized["source_url"]))
        except (ValueError, TypeError):
            return value  # Report invalid URLs through normal field validation.
        identity = json.dumps(
            [str(normalized[key]).strip() for key in keys]
            + [str(value.get("observation_date") or "undated")],
            ensure_ascii=False, separators=(",", ":"),
        )
        return {**value, "id": f"EVIDENCE-{uuid5(NAMESPACE_URL, identity)}"}


class ApplicationHistory(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: NonBlankString
    job_id: NonBlankString
    applied_at: AwareDatetime | None = None
    outcome: NonBlankString | None = None


class InterviewFeedback(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: NonBlankString
    feedback: NonBlankString
    interview_date: date | None = None
    job_id: NonBlankString | None = None
    skill: NonBlankString | None = None


class CandidateContext(BaseModel):
    """Canonical data for one candidate; no inferred verification or role fit."""

    model_config = ConfigDict(extra="forbid")

    candidate: CandidateDetail
    claims: list[ResumeClaim] = Field(default_factory=list)
    evidence_records: list[EvidenceRecord] = Field(default_factory=list)
    evidence_score: NonNegativeScore
    evidence_label: EvidenceLabel
    resume_text: str = ""
    parse_source: ResumeParseSource
    application_history: list[ApplicationHistory] = Field(default_factory=list)
    interview_feedback: list[InterviewFeedback] = Field(default_factory=list)
    reference_date: date
    context_built_at: AwareDatetime

    @field_validator("context_built_at")
    @classmethod
    def normalize_build_timestamp(cls, value):
        return value.astimezone(timezone.utc)

    @model_validator(mode="after")
    def validate_record_ownership(self):
        for records in (self.claims, self.evidence_records):
            if any(record.candidate_id != self.candidate.id for record in records):
                raise ValueError("All claims and evidence must belong to the context candidate")
            if len({record.id for record in records}) != len(records):
                raise ValueError("Duplicate claim or evidence IDs in candidate context")
        if any(record.reference_date != self.reference_date for record in self.evidence_records):
            raise ValueError("All evidence must use the context reference_date")
        if self.parse_source == ResumeParseSource.EMPTY and self.resume_text.strip():
            raise ValueError("An empty parse result cannot contain resume text")
        return self
