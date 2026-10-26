"""Offline fetcher and real disk-cache tests; public APIs are never contacted."""
import json
import time
from datetime import date

import httpx
import pytest
from diskcache import Cache
from pydantic import SecretStr

from backend.config import settings
from backend.models import EvidenceProvenance
from backend.services.signal_fetchers import SignalCache
from backend.services.signal_fetchers.common import recency_multiplier
from backend.services.signal_fetchers.github import fetch_github
from backend.services.signal_fetchers.leetcode import fetch_leetcode
from backend.services.signal_fetchers.linkedin import fetch_linkedin

REFERENCE = date(2026, 10, 26)


@pytest.fixture
def cache(tmp_path):
    return SignalCache(tmp_path / "signals")


def test_disk_cache_persistence_ttl_timestamp_and_expiry(cache):
    assert cache.get_cached("missing") is None
    assert cache.set_cached("github:user", [{"signal": "value"}])
    stored = SignalCache(cache.path).get_cached("github:user")
    assert stored.payload == [{"signal": "value"}]
    assert stored.fetched_at.tzinfo is not None
    with Cache(str(cache.path)) as raw:
        _, expiry = raw.get("github:user", expire_time=True)
        assert 21590 < expiry - time.time() <= 21600
        raw.expire(now=time.time() + 21601)
    assert cache.get_cached("github:user") is None


def test_cache_rejects_synthetic_and_invalid_ttls(tmp_path):
    cache = SignalCache(tmp_path / "not-created")
    assert not cache.set_cached("test", {}, provenance=EvidenceProvenance.SYNTHETIC)
    assert not cache.set_cached("test", {}, provenance=EvidenceProvenance.LINKEDIN_STUB)
    assert not cache.path.exists()
    assert not cache.set_cached("test", {}, ttl_seconds=0)
    with pytest.raises(ValueError):
        SignalCache(cache.path, ttl_seconds=0)


def test_corrupt_cache_and_io_failure_are_soft(cache, monkeypatch):
    with Cache(str(cache.path)) as raw:
        raw.set("corrupt", "not-json")
    assert cache.get_cached("corrupt") is None
    import backend.services.signal_fetchers as cache_module
    def broken(*args, **kwargs):
        raise OSError("unavailable")
    monkeypatch.setattr(cache_module, "Cache", broken)
    assert cache.get_cached("anything") is None
    assert cache.set_cached("anything", {}) is False


@pytest.mark.parametrize("observed,expected", [
    (None, .7), (date(2026, 4, 27), 1), (date(2026, 4, 26), .7),
    (date(2025, 4, 27), .7), (date(2025, 4, 26), .4),
    (date(2023, 10, 27), .4), (date(2023, 10, 26), .2),
])
def test_observation_recency_buckets(observed, expected):
    assert recency_multiplier(observed, REFERENCE) == expected


def repo(name="user/repo", *, fork=False, stars=0, **extra):
    return {"full_name": name, "fork": fork, "stargazers_count": stars,
            "language": "Python", "topics": ["fastapi", "fastapi"], **extra}


def commits():
    return [{"commit": {"committer": {"date": "2026-01-26T12:00:00Z"}}}]


@pytest.mark.asyncio
async def test_github_records_commit_dates_auth_and_cache_recalculation(cache, monkeypatch):
    requests = []
    monkeypatch.setattr(settings, "GITHUB_TOKEN", SecretStr("test-secret"))
    def handler(request):
        requests.append(request)
        assert request.headers["Authorization"] == "Bearer test-secret"
        if request.url.path == "/users/User/repos":
            assert request.url.params["per_page"] == "100"
            return httpx.Response(200, json=[repo(), repo("user/skip", fork=True, stars=9), repo("user/keep", fork=True, stars=10)])
        assert request.url.params["per_page"] == "1"
        return httpx.Response(200, json=commits())
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        records = await fetch_github("https://github.com/User/", candidate_id="CAND-001", reference_date=REFERENCE, client=client, cache=cache)
        assert len(requests) == 3 and len(records) == 4
        assert all(record.provenance == EvidenceProvenance.LIVE for record in records)
        assert records[0].base_weight == 3 and records[0].computed_weight == pytest.approx(2.1)
        assert records[1].base_weight == 2
        assert records[0].observation_date == date(2026, 1, 26)
        later = await fetch_github("user", candidate_id="CAND-002", reference_date=date(2028, 1, 26), client=client, cache=cache)
        assert len(requests) == 3  # Same raw observations, no HTTP requests.
        assert all(record.provenance == EvidenceProvenance.DISK_CACHE for record in later)
        assert all(record.candidate_id == "CAND-002" and record.recency_multiplier == .4 for record in later)
        assert records[0].id != later[0].id  # Ownership is part of identity.


@pytest.mark.asyncio
async def test_github_repo_cap_empty_dates_no_token(cache, monkeypatch):
    monkeypatch.setattr(settings, "GITHUB_TOKEN", None)
    calls = []
    def handler(request):
        calls.append(request)
        assert "Authorization" not in request.headers
        if request.url.path.endswith("/repos"):
            return httpx.Response(200, json=[repo(f"user/r{i}", topics=[]) for i in range(50)])
        return httpx.Response(409, json={"message": "Git repository is empty"})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        records = await fetch_github("user", candidate_id="CAND-001", reference_date=REFERENCE, client=client, cache=cache)
    assert len(calls) == 31 and len(records) == 30
    assert all(record.observation_date is None and record.recency_multiplier == .7 for record in records)


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [403, 404, 429, 500])
async def test_github_http_failures_are_not_cached(cache, status):
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(status, json={}))) as client:
        assert await fetch_github("user", candidate_id="CAND-001", reference_date=REFERENCE, client=client, cache=cache) == []
    assert cache.get_cached("github:v1:user") is None


@pytest.mark.asyncio
async def test_fetcher_timeouts_and_invalid_profiles(cache):
    calls = []
    def timeout(request):
        calls.append(request)
        raise httpx.ReadTimeout("mock timeout", request=request)
    async with httpx.AsyncClient(transport=httpx.MockTransport(timeout)) as client:
        for fetcher in [fetch_github, fetch_leetcode]:
            assert await fetcher("https://evil.test/user", candidate_id="CAND-001", reference_date=REFERENCE, client=client, cache=cache) == []
            assert not calls
        assert await fetch_github("user", candidate_id="CAND-001", reference_date=REFERENCE, client=client, cache=cache) == []
        assert await fetch_leetcode("user", candidate_id="CAND-001", reference_date=REFERENCE, client=client, cache=cache) == []
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_commit_failure_does_not_cache_partial_observations(cache):
    def handler(request):
        return httpx.Response(200, json=[repo()]) if request.url.path.endswith("/repos") else httpx.Response(500)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await fetch_github("user", candidate_id="CAND-001", reference_date=REFERENCE, client=client, cache=cache) == []
    assert cache.get_cached("github:v1:user") is None


@pytest.mark.asyncio
async def test_leetcode_language_weights_and_cached_result(cache):
    calls = []
    def handler(request):
        calls.append(request)
        body = json.loads(request.content)
        assert request.method == "POST" and str(request.url) == "https://leetcode.com/graphql"
        assert body["variables"] == {"username": "user"}
        return httpx.Response(200, json={"data": {"matchedUser": {"languageProblemCount": [
            {"languageName": "Python3", "problemsSolved": 15},
            {"languageName": "C++", "problemsSolved": 2},
            {"languageName": "Java", "problemsSolved": 0},
        ]}}})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        records = await fetch_leetcode("https://leetcode.com/u/user/", candidate_id="CAND-001", reference_date=REFERENCE, client=client, cache=cache)
        cached = await fetch_leetcode("user", candidate_id="CAND-001", reference_date=REFERENCE, client=client, cache=cache)
    assert len(calls) == 1 and len(records) == 2
    assert all(record.base_weight == 1 and record.computed_weight == .7 and record.observation_date is None for record in records)
    assert records[0].id == cached[0].id
    assert all(record.provenance == EvidenceProvenance.DISK_CACHE for record in cached)


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [{"errors": [{"message": "mock error"}]}, {}, {"data": {"matchedUser": {"languageProblemCount": "invalid"}}}])
async def test_leetcode_graphql_errors_are_soft(cache, payload):
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=payload))) as client:
        assert await fetch_leetcode("user", candidate_id="CAND-001", reference_date=REFERENCE, client=client, cache=cache) == []
    assert cache.get_cached("leetcode:v1:user") is None


@pytest.mark.asyncio
async def test_leetcode_missing_profile(cache):
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"data": {"matchedUser": None}}))) as client:
        assert await fetch_leetcode("user", candidate_id="CAND-001", reference_date=REFERENCE, client=client, cache=cache) == []


@pytest.mark.asyncio
async def test_linkedin_synthetic_fixture_and_missing_file(tmp_path):
    fixture = {"candidate_id": "CAND-001", "profile_url": "https://linkedin.com/in/user",
               "provenance": EvidenceProvenance.LINKEDIN_STUB.value,
               "headline": "Python and FastAPI developer", "about": "Builds services",
               "observation_date": "2026-01-26"}
    path = tmp_path / "CAND-001.json"
    path.write_text(json.dumps(fixture), encoding="utf-8")
    records = await fetch_linkedin("https://www.linkedin.com/in/user/", "CAND-001", reference_date=REFERENCE, fixture_dir=tmp_path)
    assert len(records) == 2
    assert all(record.provenance == EvidenceProvenance.LINKEDIN_STUB for record in records)
    assert all("Synthetic" in record.observation and record.base_weight == 1 for record in records)
    assert await fetch_linkedin("https://linkedin.com/in/user", "CAND-002", reference_date=REFERENCE, fixture_dir=tmp_path) == []
    fixture["provenance"] = "live"
    path.write_text(json.dumps(fixture), encoding="utf-8")
    assert await fetch_linkedin("https://linkedin.com/in/user", "CAND-001", reference_date=REFERENCE, fixture_dir=tmp_path) == []
    assert await fetch_linkedin("https://linkedin.com/in/user", "../CAND-001", reference_date=REFERENCE, fixture_dir=tmp_path) == []
    path.write_text("invalid-json", encoding="utf-8")
    assert await fetch_linkedin("https://linkedin.com/in/user", "CAND-001", reference_date=REFERENCE, fixture_dir=tmp_path) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [403, 429, 500])
async def test_leetcode_http_failure_is_soft_and_not_cached(cache, status):
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(status))) as client:
        assert await fetch_leetcode("user", candidate_id="CAND-001", reference_date=REFERENCE, client=client, cache=cache) == []
    assert cache.get_cached("leetcode:v1:user") is None


@pytest.mark.asyncio
async def test_expired_cache_fetches_again_and_io_cache_failure_still_returns_signals(cache, monkeypatch):
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"data": {"matchedUser": {"languageProblemCount": [{"languageName": "Python", "problemsSolved": 4}]}}})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        first = await fetch_leetcode("user", candidate_id="CAND-001", reference_date=REFERENCE, client=client, cache=cache)
        with Cache(str(cache.path)) as raw:
            raw.expire(now=time.time() + 21601)
        second = await fetch_leetcode("user", candidate_id="CAND-001", reference_date=REFERENCE, client=client, cache=cache)
        assert len(calls) == 2 and first[0].id == second[0].id
        assert second[0].provenance == EvidenceProvenance.LIVE
        import backend.services.signal_fetchers as cache_module
        def broken(*args, **kwargs):
            raise OSError("unavailable")
        monkeypatch.setattr(cache_module, "Cache", broken)
        third = await fetch_leetcode("user", candidate_id="CAND-001", reference_date=REFERENCE, client=client, cache=cache)
        assert len(third) == 1 and len(calls) == 3


@pytest.mark.asyncio
async def test_malformed_repository_json_and_profile_redirects_fail_soft(cache):
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"wrong": "shape"}))) as client:
        assert await fetch_github("user", candidate_id="CAND-001", reference_date=REFERENCE, client=client, cache=cache) == []
    calls = []
    def redirect(request):
        calls.append(request)
        return httpx.Response(302, headers={"Location": "https://example.test/other"})
    async with httpx.AsyncClient(transport=httpx.MockTransport(redirect), follow_redirects=True) as client:
        assert await fetch_github("user", candidate_id="CAND-001", reference_date=REFERENCE, client=client, cache=cache) == []
        assert await fetch_leetcode("user", candidate_id="CAND-001", reference_date=REFERENCE, client=client, cache=cache) == []
    assert len(calls) == 2
