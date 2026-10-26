"""Offline context/state/lifespan tests using controlled evidence fixtures."""
import asyncio
import importlib
import json
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest

from backend.models import EvidenceRecord
from backend.services.context_builder import ContextBuilder, ContextBuildRegistry
from backend.services.deduplicator import ResumeIngestionStore
from backend.services.identity_extractor import ExtractedIdentity
from backend.services.resume_parser import ParsedResume
from backend.services.seed_loader import SeedLoader

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
NOW = datetime(2026, 10, 26, 12, tzinfo=timezone.utc)
SOURCES = ("github", "leetcode", "linkedin")


def controlled_fetchers():
    def make(source):
        async def fetch(profile, *, candidate_id, reference_date):
            assert reference_date == NOW.date()
            fixture = json.loads((DATA_DIR / "fixtures" / f"{candidate_id}.json").read_text(encoding="utf-8"))
            return [EvidenceRecord.model_validate(record) for record in fixture["evidence_records"] if record["source_type"] == source]
        return fetch
    return {source: make(source) for source in SOURCES}


@pytest.fixture
def service():
    store = ResumeIngestionStore(SeedLoader(data_dir=DATA_DIR))
    store.repository.load_all()
    return ContextBuilder(store, fetchers=controlled_fetchers(), clock=lambda: NOW)


@pytest.mark.asyncio
@pytest.mark.parametrize("candidate_id,count", [("CAND-001", 1), ("CAND-002", 1), ("CAND-003", 0), ("CAND-004", 1), ("CAND-005", 0), ("CAND-006", 1)])
async def test_fixture_context_state_score_claims_and_reference(service, candidate_id, count):
    candidate = service.repository.get_candidate(candidate_id)
    fixture = json.loads((DATA_DIR / "fixtures" / f"{candidate_id}.json").read_text(encoding="utf-8"))
    context = await service.build_context(candidate)
    state = service.registry.get(candidate_id)
    assert state.status == "ready" and state.error is None
    assert len(context.claims) == count
    assert len(context.evidence_records) == len(fixture["evidence_records"])
    assert context.evidence_score == fixture["expected"]["evidence_score"]
    assert context.evidence_label == fixture["expected"]["evidence_label"]
    assert context.reference_date == NOW.date() and context.context_built_at == NOW
    assert context.parse_source == "stub" and context.resume_text == candidate.resume_text_stub
    assert context.application_history == context.interview_feedback == []
    assert all(claim.verification_state == "unverified" for claim in context.claims)
    state.context.resume_text = "modified snapshot"
    assert service.registry.get(candidate_id).context.resume_text != "modified snapshot"


@pytest.mark.asyncio
async def test_building_state_and_concurrent_fetchers(service):
    entered = set()
    all_entered = asyncio.Event()
    release = asyncio.Event()
    originals = service.fetchers.copy()
    def make(source):
        async def blocked(profile, **kwargs):
            entered.add(source)
            if len(entered) == 3:
                all_entered.set()
            await release.wait()
            return await originals[source](profile, **kwargs)
        return blocked
    service.fetchers = {source: make(source) for source in SOURCES}
    token = service.reserve("CAND-001")
    service.launch("CAND-001", token)
    await asyncio.wait_for(all_entered.wait(), timeout=3)
    assert service.registry.get("CAND-001").status == "building"
    release.set()
    await service.drain()
    assert service.registry.get("CAND-001").status == "ready"


@pytest.mark.asyncio
async def test_one_unexpected_source_failure_preserves_other_records(service):
    async def broken(*args, **kwargs):
        raise RuntimeError("secret upstream payload must not appear in API state")
    service.fetchers["leetcode"] = broken
    context = await service.build_context(service.repository.get_candidate("CAND-001"))
    assert context.evidence_score > 0
    assert service.registry.get("CAND-001").unavailable_sources == ("leetcode",)
    assert service.registry.get("CAND-001").status == "ready"


@pytest.mark.asyncio
async def test_all_unexpected_source_failures_mark_failed(service):
    async def broken(*args, **kwargs):
        raise RuntimeError("secret upstream payload")
    service.fetchers = {source: broken for source in SOURCES}
    assert await service.build_context(service.repository.get_candidate("CAND-001")) is None
    state = service.registry.get("CAND-001")
    assert state.status == "failed" and state.context is None
    assert state.error and "secret" not in state.error
    assert state.unavailable_sources == SOURCES


@pytest.mark.asyncio
async def test_expected_network_unavailability_can_produce_empty_ready_context(service):
    async def no_public_evidence(*args, **kwargs):
        return []
    service.fetchers = {source: no_public_evidence for source in SOURCES}
    context = await service.build_context(service.repository.get_candidate("CAND-001"))
    assert context.evidence_score == 0 and context.evidence_label == "No public evidence"
    assert service.registry.get("CAND-001").status == "ready"


@pytest.mark.asyncio
async def test_unrecoverable_local_failure_marks_failed(service, monkeypatch):
    import backend.services.context_builder as module
    def broken(*args, **kwargs):
        raise RuntimeError("unexpected parser failure")
    monkeypatch.setattr(module, "parse_resume", broken)
    assert await service.build_context(service.repository.get_candidate("CAND-001")) is None
    assert service.registry.get("CAND-001").status == "failed"


@pytest.mark.asyncio
async def test_startup_is_non_blocking_initializes_all_states_and_waits_for_traffic(service, monkeypatch):
    main = importlib.import_module("backend.main")
    monkeypatch.setattr(main, "context_builder", service)
    monkeypatch.setattr(main, "seed_loader", service.repository)
    async with main.lifespan(main.app):
        for candidate in service.repository.all_candidate_details():
            assert service.registry.get(candidate.id).status == "building"
        await asyncio.sleep(0)
        assert all(service.registry.get(c.id).status == "building" for c in service.repository.all_candidate_details())
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as client:
            assert (await client.get("/health")).status_code == 200
        await service.drain()
        assert all(service.registry.get(c.id).status == "ready" for c in service.repository.all_candidate_details())
    assert not service._tasks


@pytest.mark.asyncio
async def test_shutdown_cancels_even_not_started_workers(service):
    service.start_all(wait_for_requests=True)
    await service.shutdown()
    assert not service._tasks
    assert all(service.registry.get(c.id).status == "failed" for c in service.repository.all_candidate_details())


@pytest.mark.asyncio
async def test_late_old_build_cannot_overwrite_a_new_upload(service):
    entered, release = asyncio.Event(), asyncio.Event()
    original = service.fetchers["github"]
    async def delayed(profile, **kwargs):
        entered.set()
        await release.wait()
        return await original(profile, **kwargs)
    service.fetchers["github"] = delayed
    token = service.reserve("CAND-001")
    service.launch("CAND-001", token)
    await asyncio.wait_for(entered.wait(), 3)
    text = "Experience\n- Built Python services for new customers."
    candidate, updated, revision = service.store.upsert(
        ExtractedIdentity(email="alex.rivera@example.com", full_name="New Alex"),
        ParsedResume(raw_text=text, source="txt"), "new.txt", text.encode())
    assert updated
    # Simulate the narrow race before the new request reserves its registry state.
    release.set()
    await service.drain()
    assert service.repository.get_candidate(candidate.id).full_name == "New Alex"
    assert service.registry.get(candidate.id).context is None
    reserved = service.reserve(candidate.id, revision)
    service.launch(candidate.id, reserved)
    await service.drain()
    context = service.registry.get(candidate.id).context
    assert context.resume_text == text and context.parse_source == "txt"
    assert context.candidate.full_name == "New Alex"
    assert service.store.pending_builds[candidate.id].status == "ready"
    assert service.reserve(candidate.id, token) is None


@pytest.mark.asyncio
async def test_duplicate_observations_do_not_inflate_score(service):
    original = service.fetchers["github"]
    async def duplicate(profile, **kwargs):
        records = await original(profile, **kwargs)
        return records + records
    service.fetchers["github"] = duplicate
    context = await service.build_context(service.repository.get_candidate("CAND-001"))
    expected = json.loads((DATA_DIR / "fixtures/CAND-001.json").read_text(encoding="utf-8"))["expected"]
    assert context.evidence_score == expected["evidence_score"]


def test_registry_rejects_stale_completion_and_invalid_ready_state():
    registry = ContextBuildRegistry()
    old = registry.begin("CAND-001")
    latest = registry.begin("CAND-001")
    assert old != latest
    assert not registry.finish("CAND-001", old, error="stale")
    assert registry.get("CAND-001").status == "building"
    with pytest.raises(ValueError):
        registry.finish("CAND-001", latest)


@pytest.mark.asyncio
async def test_one_candidate_failure_does_not_abort_other_builds(service, monkeypatch):
    import backend.services.context_builder as module
    original = module.parse_resume
    def parser(path=None, stub_text=None, **kwargs):
        if stub_text and "Alex Rivera" in stub_text:
            raise RuntimeError("synthetic unrecoverable failure")
        return original(path, stub_text, **kwargs)
    monkeypatch.setattr(module, "parse_resume", parser)
    service.start_all()
    await service.drain()
    assert service.registry.get("CAND-001").status == "failed"
    assert all(service.registry.get(f"CAND-{i:03d}").status == "ready" for i in range(2, 7))


@pytest.mark.asyncio
async def test_one_reference_date_is_used_across_midnight(service):
    times = iter([datetime(2026, 10, 26, 23, 59, 59, tzinfo=timezone.utc),
                  datetime(2026, 10, 27, 0, 0, 1, tzinfo=timezone.utc)])
    service.clock = lambda: next(times)
    context = await service.build_context(service.repository.get_candidate("CAND-001"))
    assert context.reference_date.isoformat() == "2026-10-26"
    assert context.context_built_at.date().isoformat() == "2026-10-27"
    assert all(record.reference_date == context.reference_date for record in context.evidence_records)


@pytest.mark.asyncio
async def test_real_adapter_http_500_preserves_other_fixture_signals(service, tmp_path):
    from backend.services.signal_fetchers import SignalCache
    from backend.services.signal_fetchers.github import fetch_github
    requests = []
    def fail(request):
        requests.append(request)
        return httpx.Response(500, json={"message": "controlled upstream failure"})
    cache = SignalCache(tmp_path / "cache")
    async with httpx.AsyncClient(transport=httpx.MockTransport(fail)) as client:
        async def github(profile, **kwargs):
            return await fetch_github(profile, client=client, cache=cache, **kwargs)
        service.fetchers["github"] = github
        context = await service.build_context(service.repository.get_candidate("CAND-004"))
    assert len(requests) == 1
    assert service.registry.get("CAND-004").status == "ready"
    assert context.evidence_score == .7
    assert [record.source_type for record in context.evidence_records] == ["leetcode"]
