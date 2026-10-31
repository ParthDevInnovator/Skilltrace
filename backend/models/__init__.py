"""Pydantic data models for Skitrace."""
from backend.models.job import Job, JobRequirement, JobFilterParams, JobCreate
from backend.models.candidate import (
    CandidateSummary,
    CandidateDetail,
    CandidateFilterParams,
    MatchPreview,
    EvidenceLabel,
)
from backend.models.context import (
    ResumeClaim, ClaimSection, ClaimVerificationState,
    EvidenceRecord, EvidenceSourceType, EvidenceProvenance,
    CandidateContext, ResumeParseSource, ApplicationHistory, InterviewFeedback,
)

__all__ = [
    "Job",
    "JobRequirement",
    "JobFilterParams",
    "JobCreate",
    "CandidateSummary",
    "CandidateDetail",
    "CandidateFilterParams",
    "MatchPreview",
    "EvidenceLabel",
    "ResumeClaim",
    "ClaimSection",
    "ClaimVerificationState",
    "EvidenceRecord",
    "EvidenceSourceType",
    "EvidenceProvenance",
    "CandidateContext",
    "ResumeParseSource",
    "ApplicationHistory",
    "InterviewFeedback",
]

from backend.models.matching import (ExtractedRequirement, CoverageState, RequirementCoverage, CandidateMatchResult, RankedCandidate, SimilarJob)
__all__ += ["ExtractedRequirement", "CoverageState", "RequirementCoverage", "CandidateMatchResult", "RankedCandidate", "SimilarJob"]

# Database models use explicit DB-prefixed exports to avoid colliding with the
# existing Pydantic API contracts during the Phase 5 adapter migration.
from backend.models.db import (Base as DBBase, User as DBUser, Candidate as DBCandidate,
    ResumeClaim as DBResumeClaim, EvidenceRecord as DBEvidenceRecord, Job as DBJob,
    JobRequirement as DBJobRequirement, MatchResult as DBMatchResult,
    ApplicationHistory as DBApplicationHistory, InterviewFeedback as DBInterviewFeedback,
    AuditLog, ChatHistory, ContextBuildStatus)
__all__ += ["DBBase","DBUser","DBCandidate","DBResumeClaim","DBEvidenceRecord","DBJob",
    "DBJobRequirement","DBMatchResult","DBApplicationHistory","DBInterviewFeedback",
    "AuditLog","ChatHistory","ContextBuildStatus"]
