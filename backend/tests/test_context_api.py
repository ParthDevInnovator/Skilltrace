"""Context, resume, resolution and protected rebuild HTTP contracts (offline)."""
from datetime import datetime
import httpx
import pytest
from pydantic import SecretStr

from backend.main import app
from backend.config import settings
from backend.routers.ingest import get_context_builder
from backend.routers.admin import get_signal_cache
from backend.services.context_builder import ContextBuilder
from backend.services.deduplicator import ResumeIngestionStore
from backend.services.seed_loader import SeedLoader
from backend.services.signal_fetchers import SignalCache
from backend.tests.test_context_builder import controlled_fetchers, NOW, DATA_DIR


@pytest.fixture
async def api_service(tmp_path):
    service = ContextBuilder(ResumeIngestionStore(SeedLoader(data_dir=DATA_DIR)), fetchers=controlled_fetchers(), clock=lambda: NOW)
    cache = SignalCache(tmp_path / "cache")
    app.dependency_overrides[get_context_builder] = lambda: service
    app.dependency_overrides[get_signal_cache] = lambda: cache
    yield service, cache
    await service.shutdown()
    app.dependency_overrides.pop(get_context_builder, None)
    app.dependency_overrides.pop(get_signal_cache, None)


@pytest.mark.asyncio
@pytest.mark.parametrize("prefix", ["/api/v1/candidates", "/candidates"])
async def test_context_building_ready_failed_and_not_found(api_service, prefix):
    service, _ = api_service
    service.reserve("CAND-001")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(prefix + "/CAND-001/context")
        assert response.status_code == 202 and response.json()["status"] == "building"
        assert response.headers["Retry-After"] == "3"
        await service.build_context(service.repository.get_candidate("CAND-001"))
        payloads = [(await client.get(prefix + "/CAND-001/context")).json() for _ in range(3)]
        assert all(p["evidence_score"] == payloads[0]["evidence_score"] > 0 for p in payloads)
        assert all(p["evidence_label"] == payloads[0]["evidence_label"] for p in payloads)
        revision = service.reserve("CAND-001")
        service.registry.finish("CAND-001", revision, error="Synthetic failure")
        assert (await client.get(prefix + "/CAND-001/context")).status_code == 503
        assert (await client.get(prefix + "/NONEXISTENT/context")).status_code == 404


@pytest.mark.asyncio
async def test_resume_sources_empty_and_aliases(api_service):
    service, _ = api_service
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        for prefix in ["/api/v1/candidates", "/candidates"]:
            response = await client.get(prefix + "/CAND-001/resume")
            assert response.status_code == 200
            assert response.json()["source"] == "stub"
            assert response.json()["char_count"] == len(response.json()["raw_text"])
        candidate = service.repository.get_candidate("CAND-001")
        service.repository.save_candidate(candidate.model_copy(update={"resume_path": None, "resume_text_stub": None}))
        response = await client.get("/api/v1/candidates/CAND-001/resume")
        assert response.status_code == 204 and not response.content
        assert (await client.get("/api/v1/candidates/missing/resume")).status_code == 404


@pytest.mark.asyncio
async def test_resolve_route_order_filters_and_required_input(api_service):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        for prefix in ["/api/v1/candidates", "/candidates"]:
            response = await client.get(prefix + "/resolve", params={"name": " aLeX "})
            assert response.status_code == 200 and [c["id"] for c in response.json()] == ["CAND-001"]
        response = await client.get("/candidates/resolve", params={"email": " ALEX.RIVERA@example.com "})
        assert len(response.json()) == 1
        assert (await client.get("/candidates/resolve", params={"name": "not-a-person"})).json() == []
        assert (await client.get("/candidates/resolve", params={"name": "Alex", "email": "other@example.com"})).json() == []
        assert (await client.get("/candidates/resolve")).status_code == 422
        assert (await client.get("/candidates/resolve?name=%20")).status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("key,header,expected", [(None, None, 403), ("", None, 403), ("correct", None, 401), ("correct", "wrong", 401)])
async def test_rebuild_access_control(api_service, monkeypatch, key, header, expected):
    monkeypatch.setattr(settings, "ADMIN_KEY", SecretStr(key) if key is not None else None)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/seed/rebuild", headers={"X-Admin-Key": header} if header else {})
    assert response.status_code == expected


@pytest.mark.asyncio
async def test_authorized_rebuild_clears_cache_and_reloads_seeds(api_service, monkeypatch):
    service, cache = api_service
    monkeypatch.setattr(settings, "ADMIN_KEY", SecretStr("correct"))
    assert cache.set_cached("old", {"signal": True})
    service.reserve("CAND-001")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/seed/rebuild", headers={"X-Admin-Key": "correct"})
    assert response.status_code == 200, response.text
    assert response.json()["candidate_count"] == 6 and response.json()["job_count"] == 5
    assert datetime.fromisoformat(response.json()["rebuilt_at"]).tzinfo is not None
    assert cache.get_cached("old") is None
    await service.drain()
    assert all(service.registry.get(c.id).status == "ready" for c in service.repository.all_candidate_details())


@pytest.mark.asyncio
async def test_cache_clear_failure_keeps_upload_scheduling_available(api_service, monkeypatch):
    service, cache = api_service
    monkeypatch.setattr(settings, "ADMIN_KEY", SecretStr("correct"))
    def broken():
        raise OSError("synthetic cache error")
    monkeypatch.setattr(cache, "clear", broken)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/seed/rebuild", headers={"X-Admin-Key": "correct"})
        assert response.status_code == 503
    token = service.reserve("CAND-001")
    service.launch("CAND-001", token)
    await service.drain()
    assert service.registry.get("CAND-001").status == "ready"
