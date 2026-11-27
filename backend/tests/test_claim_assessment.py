"""OI-29: automatic claim-evidence links that a recruiter confirms or dismisses."""
from datetime import date
from types import SimpleNamespace

import httpx
import pytest

from backend.core.dependencies import get_current_user
from backend.main import app
from backend.models.context import (
    ClaimEvidenceLink, ClaimReviewDecision, ClaimVerificationState, EvidenceRecord, InterviewFeedback, ResumeClaim,
)
from backend.routers.ingest import get_context_builder
from backend.services.claim_assessor import assess_claim, assess_claims
from backend.services.claim_reviews import ClaimReviewStore
from backend.services.context_builder import ContextBuilder
from backend.services.deduplicator import ResumeIngestionStore
from backend.services.match_store import match_store
from backend.services.runtime_persistence import RuntimePersistence
from backend.services.seed_loader import SeedLoader
from backend.tests.test_context_builder import DATA_DIR, NOW, controlled_fetchers

REF = date(2026, 11, 1)


def claim(text, skill, candidate_id="CAND-X"):
    return ResumeClaim(candidate_id=candidate_id, claim_text=text, extraction_trigger="Built",
                       section="Projects", skill=skill, provenance="test")


def record(skill, url="https://github.com/dev/service", source="github", weight=3.0,
           provenance="live", candidate_id="CAND-X"):
    return EvidenceRecord(candidate_id=candidate_id, skill=skill, source_type=source, source_url=url,
                          observation=f"Observation about {skill}", base_weight=weight, recency_multiplier=1,
                          computed_weight=weight, reference_date=REF, provenance=provenance)


def test_matching_public_evidence_is_a_suggested_link_not_a_verification():
    result = assess_claim(claim("Built services in Python", "Python"), [record("python"), record("Go")])
    assert result.evidence_link == ClaimEvidenceLink.SUPPORTED_BY_EVIDENCE
    assert len(result.supporting_evidence_ids) == 1 and not result.conflicting_evidence_ids
    assert result.verification_state == ClaimVerificationState.UNVERIFIED
    assert "does not establish who did the work" in result.assessment_reason


def test_missing_evidence_is_never_a_contradiction():
    # Lots of public activity in other skills is still only absence of evidence.
    records = [record(skill, url=f"https://github.com/dev/repo{i}") for i, skill in enumerate(["Go", "Rust", "Java", "C++", "Go"])]
    result = assess_claim(claim("Built services in Python", "Python"), records)
    assert result.evidence_link == ClaimEvidenceLink.NO_EVIDENCE
    assert result.verification_state == ClaimVerificationState.UNVERIFIED


def test_linkedin_stub_is_not_public_support():
    stub = record("Python", url="https://www.linkedin.com/in/dev", source="linkedin", provenance="synthetic — linkedin stub")
    assert assess_claim(claim("Built services in Python", "Python"), [stub]).evidence_link == ClaimEvidenceLink.NO_EVIDENCE


def test_named_repository_in_another_language_is_a_possible_contradiction():
    records = [record("Go", url="https://github.com/dev/payments-api"), record("Python", url="https://github.com/dev/other")]
    result = assess_claim(claim("Built payments-api in Python", "Python"), records)
    assert result.evidence_link == ClaimEvidenceLink.POSSIBLE_CONTRADICTION
    assert result.conflicting_evidence_ids == [records[0].id]
    assert result.supporting_evidence_ids == [records[1].id]
    assert "payments-api" in result.assessment_reason
    # The repository's metadata including the claimed skill is support, not conflict.
    agrees = assess_claim(claim("Built payments-api in Go", "Go"), records)
    assert agrees.evidence_link == ClaimEvidenceLink.SUPPORTED_BY_EVIDENCE


def test_short_repository_names_do_not_match_ordinary_words():
    records = [record("Go", url="https://github.com/dev/api")]
    assert assess_claim(claim("Built an api in Python", "Python"), records).evidence_link == ClaimEvidenceLink.NO_EVIDENCE


def test_negative_interview_feedback_is_a_possible_contradiction():
    feedback = [InterviewFeedback(id="FB-1", feedback="Struggled with Python concurrency", skill="python"),
                InterviewFeedback(id="FB-2", feedback="Excellent Python answers", skill="Python")]
    [result] = assess_claims([claim("Built services in Python", "Python")], [record("Python")], feedback)
    assert result.evidence_link == ClaimEvidenceLink.POSSIBLE_CONTRADICTION
    assert result.conflicting_evidence_ids == ["FB-1"]


@pytest.fixture
async def service():
    builder = ContextBuilder(ResumeIngestionStore(SeedLoader(data_dir=DATA_DIR)), fetchers=controlled_fetchers(), clock=lambda: NOW)
    builder.repository.load_all()
    yield builder
    await builder.shutdown()


@pytest.mark.asyncio
async def test_builds_assess_claims_and_keep_reviews_across_rebuilds(service):
    context = await service.build_context(service.repository.get_candidate("CAND-001"))
    assert context.claim_assessment == "assessed"
    links = {c.skill: c.evidence_link for c in context.claims}
    assert links == {"Kubernetes": ClaimEvidenceLink.SUPPORTED_BY_EVIDENCE, "Kafka": ClaimEvidenceLink.NO_EVIDENCE}
    kubernetes = next(c for c in context.claims if c.skill == "Kubernetes")

    reviewed = await service.review_claim("CAND-001", kubernetes.id, ClaimReviewDecision.CONFIRMED, reviewer="Rita Recruiter")
    assert reviewed.verification_state == ClaimVerificationState.SUPPORTED
    assert reviewed.review.reviewed_by == "Rita Recruiter"
    served = service.registry.get("CAND-001").context
    assert next(c for c in served.claims if c.id == kubernetes.id).verification_state == ClaimVerificationState.SUPPORTED

    rebuilt = await service.build_context(service.repository.get_candidate("CAND-001"))
    again = next(c for c in rebuilt.claims if c.id == kubernetes.id)
    assert again.verification_state == ClaimVerificationState.SUPPORTED and again.review is not None

    cleared = await service.review_claim("CAND-001", kubernetes.id, None, reviewer="Rita Recruiter")
    assert cleared.verification_state == ClaimVerificationState.UNVERIFIED and cleared.review is None


@pytest.mark.asyncio
async def test_review_is_set_aside_when_the_evidence_link_changes(service):
    context = await service.build_context(service.repository.get_candidate("CAND-001"))
    kubernetes = next(c for c in context.claims if c.skill == "Kubernetes")
    await service.review_claim("CAND-001", kubernetes.id, ClaimReviewDecision.CONFIRMED, reviewer="R")
    # The public evidence disappears: the confirmed link no longer exists.
    async def nothing(profile, **kwargs):
        return []
    service.fetchers = {source: nothing for source in service.fetchers}
    rebuilt = await service.build_context(service.repository.get_candidate("CAND-001"))
    claim_now = next(c for c in rebuilt.claims if c.id == kubernetes.id)
    assert claim_now.evidence_link == ClaimEvidenceLink.NO_EVIDENCE
    assert claim_now.verification_state == ClaimVerificationState.UNVERIFIED and claim_now.review is None


@pytest.mark.asyncio
async def test_confirmed_contradiction_removes_claim_from_matching(service):
    from backend.services.claim_assessor import apply_review
    from backend.models.context import ClaimReview
    contradiction = assess_claim(claim("Built payments-api in Python", "Python"),
                                 [record("Go", url="https://github.com/dev/payments-api")])
    confirmed = apply_review(contradiction, ClaimReview(decision="confirmed", reviewed_link=contradiction.evidence_link,
                                                        reviewed_by="R", reviewed_at=NOW))
    assert confirmed.verification_state == ClaimVerificationState.CONTRADICTED
    dismissed = apply_review(contradiction, ClaimReview(decision="dismissed", reviewed_link=contradiction.evidence_link,
                                                        reviewed_by="R", reviewed_at=NOW))
    assert dismissed.verification_state == ClaimVerificationState.UNVERIFIED


@pytest.mark.asyncio
async def test_reviews_are_durable_and_restored(isolated_test_environment, tmp_path):
    from backend.core.database import session_factory
    store = ClaimReviewStore(session_factory)
    builder = ContextBuilder(ResumeIngestionStore(SeedLoader(data_dir=DATA_DIR)), fetchers=controlled_fetchers(),
                             clock=lambda: NOW, reviews=store)
    builder.repository.load_all()
    context = await builder.build_context(builder.repository.get_candidate("CAND-001"))
    kubernetes = next(c for c in context.claims if c.skill == "Kubernetes")
    await builder.review_claim("CAND-001", kubernetes.id, ClaimReviewDecision.DISMISSED, reviewer="R",
                               reviewer_id="not-a-uuid")
    fresh = ClaimReviewStore(session_factory)
    assert await fresh.load() >= 1
    assert fresh.for_candidate("CAND-001")[kubernetes.id].decision == ClaimReviewDecision.DISMISSED
    await builder.review_claim("CAND-001", kubernetes.id, None, reviewer="R")
    await fresh.load()
    assert kubernetes.id not in fresh.for_candidate("CAND-001")
    await builder.shutdown()


@pytest.fixture
async def api(service):
    previous = dict(app.dependency_overrides)
    app.dependency_overrides[get_context_builder] = lambda: service
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="00000000-0000-0000-0000-000000000002", email="rec@test.local", full_name="Rita Recruiter",
        roles=["recruiter"], is_active=True, workspace_id=None)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        yield service, client
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous)


@pytest.mark.asyncio
async def test_review_api_round_trip_and_errors(api):
    service, client = api
    url = "/api/v1/candidates/CAND-001/claims/{}/review"
    service.reserve("CAND-001")
    assert (await client.put(url.format("CLAIM-x"), json={"decision": "confirmed"})).status_code == 409

    context = await service.build_context(service.repository.get_candidate("CAND-001"))
    kubernetes = next(c for c in context.claims if c.skill == "Kubernetes")
    kafka = next(c for c in context.claims if c.skill == "Kafka")
    match_store._results[("JOB-X", "CAND-001")] = object()

    response = await client.put(url.format(kubernetes.id), json={"decision": "confirmed"})
    assert response.status_code == 200
    body = response.json()
    assert body["verification_state"] == "supported" and body["review"]["reviewed_by"] == "Rita Recruiter"
    assert ("JOB-X", "CAND-001") not in match_store._results
    served = (await client.get("/api/v1/candidates/CAND-001/context")).json()
    assert next(c for c in served["claims"] if c["id"] == kubernetes.id)["verification_state"] == "supported"

    no_link = await client.put(url.format(kafka.id), json={"decision": "confirmed"})
    assert no_link.status_code == 409
    assert (await client.put(url.format("CLAIM-missing"), json={"decision": "confirmed"})).status_code == 404
    assert (await client.put(url.format(kubernetes.id), json={"decision": "verified"})).status_code == 422
    assert (await client.put("/api/v1/candidates/NOPE/claims/x/review", json={"decision": "confirmed"})).status_code == 404

    cleared = await client.delete(url.format(kubernetes.id))
    assert cleared.status_code == 200 and cleared.json()["verification_state"] == "unverified"


@pytest.mark.asyncio
async def test_hiring_manager_cannot_review(api):
    service, client = api
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="00000000-0000-0000-0000-000000000003", email="hm@test.local", full_name="HM",
        roles=["hiring_manager"], is_active=True, workspace_id=None)
    await service.build_context(service.repository.get_candidate("CAND-001"))
    response = await client.put("/api/v1/candidates/CAND-001/claims/x/review", json={"decision": "confirmed"})
    assert response.status_code == 403


def test_runtime_persistence_exposes_sessions_for_the_review_store():
    assert callable(RuntimePersistence().sessions)
