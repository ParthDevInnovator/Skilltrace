import pytest
from pydantic import ValidationError
from backend.models import (
    Job,
    JobRequirement,
    CandidateSummary,
    CandidateDetail,
    MatchPreview,
    EvidenceLabel,
)


def test_job_model_instantiation():
    req = JobRequirement(
        id="REQ-1",
        requirement_text="Experience with Python and FastAPI",
        category="Backend",
        is_mandatory=True,
    )
    job = Job(
        id="JOB-001",
        title="Senior Backend Engineer",
        department="Engineering",
        location="Remote (US)",
        description_raw="We are looking for a Senior Backend Engineer to scale our services...",
        requirements=[req],
        requirements_preview=["Python", "FastAPI"],
    )

    assert job.id == "JOB-001"
    assert job.title == "Senior Backend Engineer"
    assert len(job.requirements) == 1
    assert job.requirements[0].is_mandatory is True
    assert job.created_at is not None


def test_job_validation_error():
    with pytest.raises(ValidationError):
        # Missing required fields
        Job(id="JOB-002", title="", department="Eng", location="NY", description_raw="short")


def test_candidate_model_instantiation():
    match = MatchPreview(
        fit_score=85.5,
        evidence_label=EvidenceLabel.GOOD,
    )
    candidate = CandidateSummary(
        id="CAND-001",
        full_name="Alex Rivera",
        email="alex.rivera@example.com",
        headline="Senior Systems Architect",
        location="San Francisco, CA",
        top_skills=["Python", "Distributed Systems", "Kubernetes"],
        match_preview=match,
    )

    assert candidate.id == "CAND-001"
    assert candidate.email == "alex.rivera@example.com"
    assert candidate.match_preview.fit_score == 85.5
    assert candidate.match_preview.evidence_label == "Good"


def test_candidate_detail_instantiation():
    detail = CandidateDetail(
        id="CAND-002",
        full_name="Jordan Lee",
        email="jordan.lee@example.com",
        headline="Full Stack Developer",
        location="Austin, TX",
        top_skills=["TypeScript", "React", "Node.js"],
        experience_years=6.5,
        summary="Experienced engineer specialized in performant web UIs and microservices.",
        claims_preview=["Built high-throughput payment processing engine"],
    )

    assert detail.experience_years == 6.5
    assert len(detail.claims_preview) == 1
    assert detail.match_preview is None
