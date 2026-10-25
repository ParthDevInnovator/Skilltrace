from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel, Field, EmailStr


class EvidenceLabel(str, Enum):
    NO_EVIDENCE = "No public evidence"
    LIMITED = "Limited"
    SOME = "Some"
    GOOD = "Good"
    STRONG = "Strong"


class MatchPreview(BaseModel):
    fit_score: float = Field(default=0.0, ge=0.0, le=100.0, description="Match percentage score")
    evidence_label: EvidenceLabel = Field(
        default=EvidenceLabel.NO_EVIDENCE,
        description="Categorical evidence tier according to scoring formula",
    )


class CandidateBase(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150, description="Candidate full name")
    email: EmailStr = Field(..., description="Candidate email address")
    headline: str = Field(..., description="Professional headline or current title")
    location: str = Field(..., description="Geographical location")
    top_skills: List[str] = Field(default_factory=list, description="Primary technical and domain skills")


class CandidateSummary(CandidateBase):
    id: str = Field(..., description="Unique candidate identifier, e.g. CAND-001")
    resume_path: Optional[str] = Field(default=None, description="Path to original resume document")
    match_preview: Optional[MatchPreview] = Field(
        default=None,
        description="Phase 1 placeholder / Phase 3 calculated match score",
    )


class ExternalIdentifiers(BaseModel):
    github: Optional[str] = Field(default=None, description="GitHub username or profile URL")
    linkedin: Optional[str] = Field(default=None, description="LinkedIn profile URL")
    leetcode: Optional[str] = Field(default=None, description="LeetCode username or profile URL")


class CandidateDetail(CandidateSummary):
    summary: Optional[str] = Field(default=None, description="Professional background summary")
    experience_years: Optional[float] = Field(default=None, ge=0, description="Total years of professional experience")
    external_identifiers: Optional[ExternalIdentifiers] = Field(
        default_factory=ExternalIdentifiers,
        description="Public platform links",
    )
    claims_preview: List[str] = Field(
        default_factory=list,
        description="Sample resume claim statements for verification",
    )
