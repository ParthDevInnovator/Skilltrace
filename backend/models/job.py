from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field


class JobRequirement(BaseModel):
    id: str = Field(..., description="Unique requirement ID")
    requirement_text: str = Field(..., description="Description of the skill or requirement")
    category: Optional[str] = Field(default=None, description="Category, e.g. Backend, Frontend, Cloud, Database")
    is_mandatory: bool = Field(default=True, description="Whether this requirement is mandatory or preferred")


class JobBase(BaseModel):
    title: str = Field(..., min_length=2, max_length=150, description="Job title")
    department: str = Field(..., min_length=2, max_length=100, description="Department")
    location: str = Field(..., min_length=2, max_length=100, description="Office location or Remote")
    description_raw: str = Field(..., min_length=10, description="Raw job description text")


class JobCreate(JobBase):
    requirements: List[JobRequirement] = Field(default_factory=list, description="Extracted requirements")


class Job(JobBase):
    id: str = Field(..., description="Unique job identifier, e.g. JOB-001")
    requirements: List[JobRequirement] = Field(default_factory=list, description="Requirements list")
    requirements_preview: List[str] = Field(default_factory=list, description="Top requirements for preview cards")
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO 8601 creation timestamp",
    )


class JobFilterParams(BaseModel):
    search: Optional[str] = Field(default=None, description="Search query matching title, department, or description")
    department: Optional[str] = Field(default=None, description="Department filter")
    location: Optional[str] = Field(default=None, description="Location filter")
