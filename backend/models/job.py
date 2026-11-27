from datetime import datetime, timezone
from typing import List, Literal, Optional
from pydantic import BaseModel, Field

# OI-45: one limit for pasted and uploaded job descriptions, matching the resume parser.
MAX_DESCRIPTION_CHARS = 100_000
MAX_REQUIREMENTS = 40

JobStatus = Literal["draft", "active", "closed", "archived"]
# Candidates can be added while a job is being set up or is open; not once it is closed.
OPEN_STATUSES = frozenset({"draft", "active"})


class JobRequirement(BaseModel):
    id: str = Field(..., description="Unique requirement ID")
    requirement_text: str = Field(..., min_length=1, max_length=500, description="Description of the skill or requirement")
    category: Optional[str] = Field(default=None, description="Category, e.g. Backend, Frontend, Cloud, Database")
    is_mandatory: bool = Field(default=True, description="Whether this requirement is mandatory or preferred")


class JobFields(BaseModel):
    """Structured requisition fields (OI-31), no longer folded into the description text."""
    employment_type: Optional[str] = Field(default=None, max_length=64)
    experience_range: Optional[str] = Field(default=None, max_length=64)
    hiring_manager: Optional[str] = Field(default=None, max_length=255)


class JobBase(BaseModel):
    title: str = Field(..., min_length=2, max_length=150, description="Job title")
    department: str = Field(..., min_length=2, max_length=100, description="Department")
    location: str = Field(..., min_length=2, max_length=100, description="Office location or Remote")
    description_raw: str = Field(..., min_length=10, max_length=MAX_DESCRIPTION_CHARS, description="Raw job description text")


class JobCreate(JobBase, JobFields):
    # None: the server extracts requirements from the description. A list is used exactly as
    # sent, so the requirements a recruiter reviewed are the ones that get scored (OI-45).
    requirements: Optional[List[JobRequirement]] = Field(default=None, max_length=MAX_REQUIREMENTS,
                                                         description="Requirements to score; omit to extract")
    status: Literal["draft", "active"] = Field(default="active", description="Initial lifecycle status")


class JobUpdate(JobFields):
    """Partial edit of a custom job. Requirements, when sent, replace the scored list."""
    title: Optional[str] = Field(default=None, min_length=2, max_length=150)
    department: Optional[str] = Field(default=None, min_length=2, max_length=100)
    location: Optional[str] = Field(default=None, min_length=2, max_length=100)
    description_raw: Optional[str] = Field(default=None, min_length=10, max_length=MAX_DESCRIPTION_CHARS)
    requirements: Optional[List[JobRequirement]] = Field(default=None, min_length=1, max_length=MAX_REQUIREMENTS)
    status: Optional[JobStatus] = None


class JobCandidateCounts(BaseModel):
    """Candidates added to this job (OI-30), by analysis state."""
    total: int = 0
    analyzed: int = 0
    processing: int = 0
    failed: int = 0


class Job(JobBase, JobFields):
    id: str = Field(..., description="Unique job identifier, e.g. JOB-001")
    requirements: List[JobRequirement] = Field(default_factory=list, description="Requirements list")
    requirements_preview: List[str] = Field(default_factory=list, description="Top requirements for preview cards")
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO 8601 creation timestamp",
    )
    updated_at: Optional[str] = Field(default=None, description="ISO 8601 time of the last edit")
    workspace_id: Optional[str] = Field(default=None, description="Owning workspace; None means the default workspace")
    status: JobStatus = Field(default="active", description="Lifecycle status")
    is_custom: bool = Field(default=False, description="Created in this app; bundled demo jobs are read-only")
    candidate_counts: Optional[JobCandidateCounts] = Field(default=None, description="Per-job candidate counts")


class JobEvent(BaseModel):
    id: str
    job_id: str
    kind: str
    actor_name: str
    candidate_id: Optional[str] = None
    detail: dict = Field(default_factory=dict)
    occurred_at: datetime


class JobFilterParams(BaseModel):
    search: Optional[str] = Field(default=None, description="Search query matching title, department, or description")
    department: Optional[str] = Field(default=None, description="Department filter")
    location: Optional[str] = Field(default=None, description="Location filter")
    status: Optional[JobStatus] = Field(default=None, description="Lifecycle status filter")
