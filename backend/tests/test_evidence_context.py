import json
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.models import (
    ApplicationHistory, CandidateContext, CandidateDetail, EvidenceProvenance,
    EvidenceRecord, EvidenceSourceType, ResumeClaim, ResumeParseSource,
)
from backend.services.seed_loader import SeedLoader


DATA_DIR = Path(__file__).resolve().parents[1] / "data"


@pytest.fixture
def record_data():
    return {
        "candidate_id": "CAND-001", "skill": "Python", "source_type": "github",
        "source_url": "https://example.test/observation", "observation": "Synthetic Python repository",
        "base_weight": 3, "recency_multiplier": 0.7, "computed_weight": 2.1,
        "observation_date": "2026-01-26", "reference_date": "2026-10-26",
        "provenance": EvidenceProvenance.SYNTHETIC,
    }


@pytest.fixture
def context_data(record_data):
    candidate = CandidateDetail.model_validate_json((DATA_DIR / "candidates/CAND-001.json").read_text(encoding="utf-8"))
    return {
        "candidate": candidate, "evidence_records": [EvidenceRecord(**record_data)],
        "evidence_score": 2.1, "evidence_label": "Some",
        "resume_text": candidate.resume_text_stub, "parse_source": "stub",
        "reference_date": "2026-10-26", "context_built_at": "2026-10-26T12:00:00+05:30",
    }


def test_evidence_identity_survives_cache_refresh_and_serialization(record_data):
    record = EvidenceRecord(**record_data)
    cached = EvidenceRecord(**{
        **record_data, "source_type": EvidenceSourceType.GITHUB,
        "source_url": record.source_url, "observation_date": date(2026, 1, 26),
        "provenance": "disk_cache", "reference_date": "2027-10-26",
        "recency_multiplier": 0.4, "computed_weight": 1.2,
    })
    assert record.id == cached.id
    assert record.id != EvidenceRecord(**{**record_data, "candidate_id": "CAND-002"}).id
    assert EvidenceRecord.model_validate_json(record.model_dump_json()) == record


@pytest.mark.parametrize("field,value", [
    ("base_weight", -1), ("base_weight", float("inf")),
    ("computed_weight", float("nan")), ("computed_weight", 99),
    ("recency_multiplier", -0.1), ("recency_multiplier", 1.1),
    ("source_url", "javascript:alert(1)"), ("source_type", "unknown"),
    ("provenance", "verified"), ("skill", " "), ("candidate_id", ""),
])
def test_evidence_rejects_invalid_observations(record_data, field, value):
    with pytest.raises(ValidationError):
        EvidenceRecord(**{**record_data, field: value})


@pytest.mark.parametrize("source", ["interview_feedback", "project_submission"])
def test_non_public_evidence_sources_are_supported(record_data, source):
    record = EvidenceRecord(**{**record_data, "source_type": source})
    assert record.source_type.value == source


def test_context_utc_roundtrip_and_independent_history_defaults(context_data):
    context = CandidateContext(**context_data)
    assert context.context_built_at == datetime(2026, 10, 26, 6, 30, tzinfo=timezone.utc)
    assert context.context_built_at.utcoffset().total_seconds() == 0
    assert context.parse_source is ResumeParseSource.STUB
    assert CandidateContext.model_validate_json(context.model_dump_json()) == context
    other = CandidateContext(**context_data)
    context.application_history.append(ApplicationHistory(id="application-1", job_id="JOB-001"))
    assert other.application_history == []
    assert context.interview_feedback == []


def test_context_does_not_infer_claim_verification(context_data):
    claim = ResumeClaim(
        candidate_id="CAND-001", claim_text="Built Python services", section="Experience",
        extraction_trigger="Built", skill="Python", provenance="Synthetic extraction rule",
    )
    context = CandidateContext(**context_data, claims=[claim])
    assert context.claims[0].verification_state == "unverified"


@pytest.mark.parametrize("change", ["wrong_candidate", "wrong_reference", "duplicate", "naive_timestamp", "empty_parse"])
def test_context_rejects_inconsistent_data(context_data, record_data, change):
    if change == "wrong_candidate":
        context_data["evidence_records"] = [EvidenceRecord(**{**record_data, "candidate_id": "CAND-002"})]
    elif change == "wrong_reference":
        context_data["reference_date"] = "2027-10-26"
    elif change == "duplicate":
        context_data["evidence_records"] *= 2
    elif change == "naive_timestamp":
        context_data["context_built_at"] = "2026-10-26T12:00:00"
    else:
        context_data["parse_source"] = "empty"
    with pytest.raises(ValidationError):
        CandidateContext(**context_data)


@pytest.mark.parametrize("candidate_id", [f"CAND-{i:03d}" for i in range(1, 7)])
def test_controlled_fixture_and_seed_stub(candidate_id):
    fixture = json.loads((DATA_DIR / "fixtures" / f"{candidate_id}.json").read_text(encoding="utf-8"))
    records = [EvidenceRecord.model_validate(record) for record in fixture["evidence_records"]]
    assert fixture["provenance"] == EvidenceProvenance.SYNTHETIC
    assert fixture["candidate_id"] == candidate_id
    assert fixture["reference_date"] == "2026-10-26"
    assert all(record.candidate_id == candidate_id for record in records)
    assert all(record.provenance == EvidenceProvenance.SYNTHETIC for record in records)
    assert all(record.source_url.host == "example.test" for record in records)
    assert len({record.id for record in records}) == len(records)
    assert [record.computed_weight for record in records] == fixture["expected"]["computed_weights"]
    total = sum((Decimal(str(record.base_weight)) * Decimal(str(record.recency_multiplier)) for record in records), Decimal(0))
    assert float(total) == fixture["expected"]["evidence_score"]
    # Independent expectations for future scoring tests; no scoring service exists yet.
    label = ("No public evidence" if total == 0 else "Limited" if total <= 2 else
             "Some" if total <= 5 else "Good" if total <= 9 else "Strong")
    assert label == fixture["expected"]["evidence_label"]
    loader = SeedLoader(data_dir=DATA_DIR)
    candidate = loader.get_candidate(candidate_id)
    assert candidate is not None
    assert len(candidate.resume_text_stub) >= 200
    assert "SYNTHETIC DEMO RESUME" in candidate.resume_text_stub
    assert candidate.full_name in candidate.resume_text_stub
    assert candidate.email in candidate.resume_text_stub
    assert candidate.claims_preview[0] in candidate.resume_text_stub
    context = CandidateContext(
        candidate=candidate, evidence_records=records,
        evidence_score=fixture["expected"]["evidence_score"],
        evidence_label=fixture["expected"]["evidence_label"],
        resume_text=candidate.resume_text_stub, parse_source="stub",
        reference_date=fixture["reference_date"], context_built_at="2026-10-26T00:00:00Z",
    )
    assert context.parse_source is ResumeParseSource.STUB
    assert context.application_history == context.interview_feedback == []
