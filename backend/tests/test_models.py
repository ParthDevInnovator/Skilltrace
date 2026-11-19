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


def test_claims_and_evidence_publish_canonical_skill_names():
    """OI-12: screens join skills on the taxonomy name, not the raw label."""
    from datetime import date
    from backend.models.context import EvidenceRecord, ResumeClaim
    def record(skill):
        return EvidenceRecord(candidate_id="CAND-001", skill=skill, source_type="github", source_url="https://github.com/a/b",
                              observation=f"topic {skill}", base_weight=2, recency_multiplier=1, computed_weight=2,
                              reference_date=date(2026, 1, 1), provenance="live")
    assert {record(s).canonical_skill for s in ("Kafka", "apache-kafka", "Apache Kafka")} == {"Apache Kafka"}
    assert record("k8s").canonical_skill == "Kubernetes"
    assert record("some-unknown-topic").canonical_skill is None
    stored = record("Kafka")
    assert EvidenceRecord.model_validate(stored.model_dump()).id == stored.id  # IDs unchanged.
    claim = ResumeClaim(candidate_id="CAND-001", claim_text="Built Kafka pipelines", extraction_trigger="Built",
                        section="Experience", skill="Kafka", provenance="resume")
    assert claim.canonical_skill == "Apache Kafka"
