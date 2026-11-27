"""Fix Phase 1 (P1 production blockers) regression tests: OI-01..09 and OI-35."""
import uuid
from datetime import timedelta
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from sqlalchemy import func, select

from backend.config import settings
from backend.core.database import session_factory
from backend.core.dependencies import get_current_user
from backend.core.masking import current_role
from backend.core.roles import Role
from backend.core.security import hash_password, token_blacklist
from backend.core.workspace import current_workspace
from backend.main import app
from backend.models.db import (AuditLog, Candidate, CandidateResume, ContextBuildStatus, MembershipRequest,
    User, Workspace)
from backend.routers import admin as admin_routes
from backend.routers import candidates as candidate_routes
from backend.routers.ingest import get_context_builder, get_ingestion_store
from backend.services import agent
from backend.services.agent import tools
from backend.services.audit import audit_writer
from backend.services.context_builder import ContextBuilder
from backend.services.deduplicator import ResumeIngestionStore
from backend.services.runtime_persistence import RuntimePersistence
from backend.services.seed_loader import SeedLoader

RESUME = """Name: Priya Durable
Email: {email}
Title: Senior Python Engineer
Location: Pune
https://github.com/priya-durable
Experience
- Built reliable Python services and Kubernetes automation for customers.
"""
SOURCES = ("github", "leetcode", "linkedin")
RealAsyncClient = httpx.AsyncClient  # OAuth tests patch httpx.AsyncClient for the provider calls.


def principal(role="recruiter", workspace="default", user_id=None):
    return SimpleNamespace(id=user_id or uuid.uuid4(), email=f"{role}@example.com", full_name=role,
                           roles=[role], is_active=True, workspace_id=workspace)


def as_user(user):
    app.dependency_overrides[get_current_user] = lambda: user


def client():
    return RealAsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


def make_builder():
    async def no_signals(*args, **kwargs):
        return []
    repository = SeedLoader(load_demo_data=False)
    repository.load_all()
    store = ResumeIngestionStore(repository)
    return ContextBuilder(store, fetchers={name: no_signals for name in SOURCES}, persistence=RuntimePersistence())


@pytest.fixture
async def pipeline(monkeypatch):
    # Like application startup: the cache starts from durable state, so new IDs never collide.
    builder = make_builder()
    await builder.persistence.restore(builder, include_contexts=False)
    app.dependency_overrides[get_ingestion_store] = lambda: builder.store
    app.dependency_overrides[get_context_builder] = lambda: builder
    monkeypatch.setattr(candidate_routes, "seed_loader", builder.repository)
    yield builder
    await builder.shutdown()


async def upload(http, email=None, name="priya.txt"):
    email = email or f"priya.{uuid.uuid4().hex[:8]}@example.com"
    response = await http.post("/api/v1/ingest/resume",
                               files={"file": (name, RESUME.format(email=email).encode(), "text/plain")})
    assert response.status_code == 202, response.text
    return response.json()["candidate_id"], email


async def count(model, **where):
    async with session_factory()() as db:
        query = select(func.count()).select_from(model)
        for key, value in where.items():
            query = query.where(getattr(model, key) == value)
        return await db.scalar(query)


# --- OI-01: durable candidates --------------------------------------------------

@pytest.mark.asyncio
async def test_uploaded_candidate_survives_restart(pipeline):
    as_user(principal())
    async with client() as http:
        candidate_id, email = await upload(http)
        await pipeline.drain()
        assert pipeline.registry.get(candidate_id).status == "ready"

    # A cold process: empty caches, same database.
    cold = make_builder()
    counts = await cold.persistence.restore(cold)
    assert counts["candidates"] >= 1 and counts["contexts"] >= 1
    restored = cold.repository.get_candidate(candidate_id)
    assert restored is not None and str(restored.email) == email and restored.workspace_id == "default"
    assert cold.store.pending_builds[candidate_id].original_bytes == RESUME.format(email=email).encode()
    entry = cold.registry.get(candidate_id)
    assert entry.status == "ready" and entry.context.candidate.id == candidate_id
    # Restored results are current: start_all must not rebuild them.
    cold.start_all()
    assert cold.registry.get(candidate_id).revision == entry.revision
    assert candidate_id not in {key[0] for key in cold._task_keys.values()}
    await cold.drain()

    app.dependency_overrides[get_ingestion_store] = lambda: cold.store
    app.dependency_overrides[get_context_builder] = lambda: cold
    candidate_routes.seed_loader = cold.repository
    try:
        async with client() as http:
            assert (await http.get(f"/api/v1/candidates/{candidate_id}")).status_code == 200
            assert (await http.get(f"/api/v1/candidates/{candidate_id}/context")).json()["candidate"]["id"] == candidate_id
            assert "Priya Durable" in (await http.get(f"/api/v1/candidates/{candidate_id}/resume")).json()["raw_text"]
    finally:
        from backend.services.seed_loader import seed_loader
        candidate_routes.seed_loader = seed_loader


@pytest.mark.asyncio
async def test_interrupted_build_is_rebuilt_after_restart(pipeline):
    as_user(principal())
    async with client() as http:
        pipeline._closing = True  # Upload is saved, but the build never runs (crash).
        candidate_id, _ = await upload(http)
    cold = make_builder()
    await cold.persistence.restore(cold)
    assert cold.registry.get(candidate_id) is None
    cold.start_all()
    await cold.drain()
    assert cold.registry.get(candidate_id).status == "ready"
    async with session_factory()() as db:
        assert (await db.get(ContextBuildStatus, candidate_id)).status == "ready"


@pytest.mark.asyncio
async def test_failed_durable_write_rejects_upload_and_changes_nothing(pipeline, monkeypatch):
    async def broken(*args, **kwargs):
        from backend.services.runtime_persistence import PersistenceError
        raise PersistenceError("database down")
    monkeypatch.setattr(pipeline.persistence, "save_ingest", broken)
    before = set(pipeline.store.pending_builds)
    as_user(principal())
    async with client() as http:
        response = await http.post("/api/v1/ingest/resume", files={"file": (
            "x.txt", RESUME.format(email="nobody.saved@example.com").encode(), "text/plain")})
    assert response.status_code == 503
    assert not [c for c in pipeline.repository.all_candidate_details() if str(c.email) == "nobody.saved@example.com"]
    assert set(pipeline.store.pending_builds) == before


# --- OI-03: complete deletion ---------------------------------------------------

class FakeGraph:
    enabled = True

    def __init__(self, ok=True):
        self.ok, self.deleted = ok, []

    async def delete_candidate(self, candidate_id):
        self.deleted.append(candidate_id)
        return self.ok


class FakeCache:
    def __init__(self):
        self.calls = []

    def delete_matching(self, handles):
        self.calls.append(handles)
        return 2


@pytest.mark.asyncio
async def test_uploaded_candidate_is_erased_from_every_store(pipeline):
    graph, cache = FakeGraph(), FakeCache()
    app.dependency_overrides[admin_routes.get_graph] = lambda: graph
    app.dependency_overrides[admin_routes.get_signal_cache] = lambda: cache
    as_user(principal())
    async with client() as http:
        candidate_id, _ = await upload(http)
        await pipeline.drain()
        assert (await http.get(f"/api/v1/candidates/{candidate_id}")).status_code == 200
        assert await count(Candidate, id=candidate_id) == 1
        admin = principal("hr_admin")
        as_user(admin)
        assert (await http.delete(f"/api/v1/candidates/{candidate_id}")).status_code == 204
        for path in ("", "/context", "/resume"):
            assert (await http.get(f"/api/v1/candidates/{candidate_id}{path}")).status_code == 404
        assert (await http.delete(f"/api/v1/candidates/{candidate_id}")).status_code == 404
    assert graph.deleted == [candidate_id] and cache.calls == [["priya-durable"]]
    assert pipeline.repository.get_candidate(candidate_id) is None
    assert candidate_id not in pipeline.store.pending_builds and pipeline.registry.get(candidate_id) is None
    for model in (Candidate, CandidateResume, ContextBuildStatus):
        key = "id" if model is Candidate else "candidate_id"
        assert await count(model, **{key: candidate_id}) == 0
    async with session_factory()() as db:
        erasure = (await db.scalars(select(AuditLog).where(AuditLog.action_type == "DELETE",
                   AuditLog.candidate_id == candidate_id))).all()
    assert len(erasure) == 1 and erasure[0].detail["graph"] == "deleted"
    # The agent can no longer see the candidate either.
    token = tools.current_service.set(pipeline)
    try:
        assert candidate_id not in [c.id for c in await tools.lookup_candidate(name="Priya Durable")]
    finally:
        tools.current_service.reset(token)


@pytest.mark.asyncio
async def test_graph_failure_aborts_deletion_without_removing_anything(pipeline):
    app.dependency_overrides[admin_routes.get_graph] = lambda: FakeGraph(ok=False)
    app.dependency_overrides[admin_routes.get_signal_cache] = lambda: FakeCache()
    as_user(principal())
    async with client() as http:
        candidate_id, _ = await upload(http)
        await pipeline.drain()
        as_user(principal("hr_admin"))
        assert (await http.delete(f"/api/v1/candidates/{candidate_id}")).status_code == 503
    assert pipeline.repository.get_candidate(candidate_id) is not None
    assert await count(Candidate, id=candidate_id) == 1


@pytest.mark.asyncio
async def test_deletion_cancels_a_build_that_is_still_running(pipeline):
    import asyncio
    entered, release = asyncio.Event(), asyncio.Event()

    async def slow(*args, **kwargs):
        entered.set()
        await release.wait()
        return []
    pipeline.fetchers["github"] = slow
    app.dependency_overrides[admin_routes.get_graph] = lambda: SimpleNamespace(enabled=False)
    app.dependency_overrides[admin_routes.get_signal_cache] = lambda: FakeCache()
    as_user(principal())
    async with client() as http:
        candidate_id, _ = await upload(http)
        await asyncio.wait_for(entered.wait(), 3)
        as_user(principal("hr_admin"))
        assert (await http.delete(f"/api/v1/candidates/{candidate_id}")).status_code == 204
    release.set()
    await pipeline.drain()
    assert pipeline.repository.get_candidate(candidate_id) is None and pipeline.registry.get(candidate_id) is None
    assert await count(ContextBuildStatus, candidate_id=candidate_id) == 0


# --- OI-04: hiring-manager masking ------------------------------------------------

@pytest.mark.asyncio
async def test_hiring_manager_never_receives_contact_details_or_raw_resume(pipeline):
    as_user(principal())
    async with client() as http:
        candidate_id, email = await upload(http)
        await pipeline.drain()
        as_user(principal("hiring_manager"))
        listed = (await http.get("/api/v1/candidates")).json()
        detail = (await http.get(f"/api/v1/candidates/{candidate_id}")).json()
        resolved = await http.get("/api/v1/candidates/resolve", params={"name": "Priya"})
        for payload in (listed, detail, resolved.json()):
            assert email not in str(payload) and "Pune" not in str(payload)
        assert (await http.get("/api/v1/candidates/resolve", params={"email": email})).status_code == 403
        assert (await http.get("/api/v1/candidates", params={"search": email})).json() == []
        assert (await http.get(f"/api/v1/candidates/{candidate_id}/resume")).status_code == 403
        assert (await http.get(f"/api/v1/candidates/{candidate_id}/context")).status_code == 403
        as_user(principal("recruiter"))
        assert email in str((await http.get(f"/api/v1/candidates/{candidate_id}")).json())


@pytest.mark.asyncio
async def test_agent_tools_apply_the_callers_role(pipeline):
    as_user(principal())
    async with client() as http:
        candidate_id, email = await upload(http)
        await pipeline.drain()
    tokens = (tools.current_service.set(pipeline), current_role.set(Role.hiring_manager), current_workspace.set("default"))
    try:
        found = await tools.lookup_candidate(name="Priya Durable")
        assert found and email not in str([c.model_dump() for c in found]) and "Pune" not in str([c.model_dump() for c in found])
        assert "error" in await tools.lookup_candidate(email=email)
        context = await tools.get_candidate_context(candidate_id)
        assert getattr(context, "status", None) == "failed" and "resume" not in str(context).lower()
    finally:
        current_workspace.reset(tokens[2]); current_role.reset(tokens[1]); tools.current_service.reset(tokens[0])
    tokens = (tools.current_service.set(pipeline), current_role.set(Role.recruiter), current_workspace.set("default"))
    try:
        assert (await tools.get_candidate_context(candidate_id)).candidate.id == candidate_id
    finally:
        current_workspace.reset(tokens[2]); current_role.reset(tokens[1]); tools.current_service.reset(tokens[0])


# --- OI-05: admission and workspaces -------------------------------------------

async def add_workspace(workspace_id, domains):
    async with session_factory()() as db:
        if await db.get(Workspace, workspace_id) is None:
            db.add(Workspace(id=workspace_id, name=workspace_id.title(), allowed_domains=domains))
            await db.commit()


@pytest.mark.asyncio
async def test_allowed_domain_signup_is_admitted_only_after_email_verification():
    app.dependency_overrides.pop(get_current_user, None)
    domain = f"acme-{uuid.uuid4().hex[:6]}.com"
    await add_workspace(f"acme-{domain[:10]}", [domain])
    email = f"new.recruiter@{domain}"
    async with client() as http:
        registered = (await http.post("/api/v1/auth/register", json={"email": email, "password": "StrongPass123!",
                                                                      "full_name": "New Recruiter"})).json()
        assert registered["status"] == "pending" and registered["roles"] == ["pending"]
        login = (await http.post("/api/v1/auth/login", json={"email": email, "password": "StrongPass123!"})).json()
        headers = {"Authorization": f"Bearer {login['access_token']}"}
        assert (await http.get("/api/v1/candidates", headers=headers)).status_code == 403
        assert (await http.get("/api/v1/jobs", headers=headers)).status_code == 403
        verified = (await http.post("/api/v1/auth/verify-email", json={"token": registered["verification_token"]})).json()
        assert verified["status"] == "admitted" and verified["roles"] == ["recruiter"]
        assert (await http.post("/api/v1/auth/verify-email", json={"token": registered["verification_token"]})).status_code == 400
        me = (await http.get("/api/v1/auth/me", headers=headers)).json()
        assert me["status"] == "active" and me["workspace"]["id"] == f"acme-{domain[:10]}"
        assert (await http.get("/api/v1/candidates", headers=headers)).status_code == 200


@pytest.mark.asyncio
async def test_outside_domain_waits_for_admin_approval_in_admins_workspace():
    app.dependency_overrides.pop(get_current_user, None)
    email = f"outsider.{uuid.uuid4().hex[:6]}@elsewhere.org"
    async with client() as http:
        registered = (await http.post("/api/v1/auth/register", json={"email": email, "password": "StrongPass123!",
                                                                      "full_name": "Outside Person"})).json()
        await http.post("/api/v1/auth/verify-email", json={"token": registered["verification_token"]})
        login = (await http.post("/api/v1/auth/login", json={"email": email, "password": "StrongPass123!"})).json()
        headers = {"Authorization": f"Bearer {login['access_token']}"}
        assert (await http.get("/api/v1/candidates", headers=headers)).status_code == 403
        # Another workspace's admin cannot see or approve the request.
        await add_workspace("other-org", [])
        as_user(principal("hr_admin", workspace="other-org"))
        assert email not in str((await http.get("/api/v1/admin/membership-requests")).json())
        async with session_factory()() as db:
            request_id = str(await db.scalar(select(MembershipRequest.id).join(User, User.id == MembershipRequest.user_id)
                                             .where(User.email == email)))
        assert (await http.post(f"/api/v1/admin/membership-requests/{request_id}/approve")).status_code == 404
        as_user(principal("hr_admin"))
        assert email in str((await http.get("/api/v1/admin/membership-requests")).json())
        approved = await http.post(f"/api/v1/admin/membership-requests/{request_id}/approve", json={"role": "hiring_manager"})
        assert approved.status_code == 200 and approved.json()["workspace_id"] == "default"
        app.dependency_overrides.pop(get_current_user, None)
        assert (await http.get("/api/v1/candidates", headers=headers)).status_code == 200


@pytest.mark.asyncio
async def test_workspaces_cannot_read_each_others_records(pipeline):
    as_user(principal("recruiter", workspace="team-a"))
    async with client() as http:
        candidate_id, email = await upload(http)
        job = (await http.post("/api/v1/jobs", json={"title": "Team A role", "department": "Eng", "location": "Pune",
               "description_raw": "Build Python services for team A customers."})).json()
        await pipeline.drain()
        as_user(principal("hr_admin", workspace="team-b"))
        assert candidate_id not in str((await http.get("/api/v1/candidates")).json())
        assert job["id"] not in str((await http.get("/api/v1/jobs")).json())
        for path in (f"/api/v1/candidates/{candidate_id}", f"/api/v1/candidates/{candidate_id}/context",
                     f"/api/v1/candidates/{candidate_id}/resume", f"/api/v1/jobs/{job['id']}",
                     f"/api/v1/candidates/{candidate_id}/graph"):
            assert (await http.get(path)).status_code == 404, path
        assert (await http.get("/api/v1/candidates/resolve", params={"email": email})).json() == []
        assert (await http.post("/api/v1/jd/rank", json={"job_id": job["id"]})).status_code == 404
        assert (await http.delete(f"/api/v1/candidates/{candidate_id}")).status_code == 404
        # Same email in team B is a different candidate, not a duplicate of team A's.
        other_id, _ = await upload(http, email=email)
        assert other_id != candidate_id
    tokens = (tools.current_service.set(pipeline), current_role.set(Role.recruiter), current_workspace.set("team-b"))
    try:
        assert [c.id for c in await tools.lookup_candidate(email=email)] == [other_id]
        assert job["id"] not in str(await tools.list_jobs())
    finally:
        current_workspace.reset(tokens[2]); current_role.reset(tokens[1]); tools.current_service.reset(tokens[0])


@pytest.mark.asyncio
async def test_clerk_provisioning_uses_verified_email_and_admission(monkeypatch):
    from backend.core import dependencies
    domain = f"clerk-{uuid.uuid4().hex[:6]}.io"
    await add_workspace(f"ws-{domain[:12]}", [domain])

    async def verified(clerk_id):
        return {"email": f"{clerk_id}@{domain}", "email_verified": True, "full_name": "Clerk Person"}

    async def unverified(clerk_id):
        return {"email": f"{clerk_id}@{domain}", "email_verified": False, "full_name": "Unverified"}
    monkeypatch.setattr(dependencies, "fetch_clerk_profile", verified)
    async with session_factory()() as db:
        user = await dependencies._provision_clerk_user(db, f"user_{uuid.uuid4().hex[:8]}")
        assert user.roles == ["recruiter"] and user.workspace_id == f"ws-{domain[:12]}" and user.auth_provider == "clerk"
    monkeypatch.setattr(dependencies, "fetch_clerk_profile", unverified)
    async with session_factory()() as db:
        user = await dependencies._provision_clerk_user(db, f"user_{uuid.uuid4().hex[:8]}")
        assert user.roles == ["pending"] and user.workspace_id is None


@pytest.mark.asyncio
async def test_domain_settings_are_workspace_scoped_and_unique():
    await add_workspace("domain-a", ["shared-domain.com"])
    as_user(principal("hr_admin", workspace="default"))
    async with client() as http:
        assert (await http.patch("/api/v1/admin/workspaces/domain-a/domains", json={"allowed_domains": ["x.com"]})).status_code == 404
        assert (await http.patch("/api/v1/admin/workspaces/default/domains",
                                 json={"allowed_domains": ["shared-domain.com"]})).status_code == 409
        assert (await http.patch("/api/v1/admin/workspaces/default/domains",
                                 json={"allowed_domains": ["not a domain"]})).status_code == 422


# --- OI-06: sessions -------------------------------------------------------------

async def native_user(email=None, workspace="default"):
    email = email or f"session.{uuid.uuid4().hex[:8]}@example.com"
    async with session_factory()() as db:
        db.add(User(email=email, full_name="Session User", hashed_password=hash_password("StrongPass123!"),
                    roles=["recruiter"], workspace_id=workspace, email_verified=True))
        await db.commit()
    return email


@pytest.mark.asyncio
async def test_logout_revokes_refresh_family_and_survives_restart():
    app.dependency_overrides.pop(get_current_user, None)
    email = await native_user()
    async with client() as http:
        pair = (await http.post("/api/v1/auth/login", json={"email": email, "password": "StrongPass123!"})).json()
        rotated = (await http.post("/api/v1/auth/refresh", json={"refresh_token": pair["refresh_token"]})).json()
        assert rotated["refresh_token"] != pair["refresh_token"]
        headers = {"Authorization": f"Bearer {rotated['access_token']}"}
        assert (await http.get("/api/v1/auth/me", headers=headers)).status_code == 200
        assert (await http.post("/api/v1/auth/logout", headers=headers,
                                json={"refresh_token": rotated["refresh_token"]})).status_code == 204
        assert (await http.post("/api/v1/auth/refresh", json={"refresh_token": rotated["refresh_token"]})).status_code == 401
        # The first access token belongs to the same (now revoked) session.
        assert (await http.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {pair['access_token']}"})).status_code == 401
        token_blacklist._jtis.clear()  # Simulated restart: process-local cache is gone.
        assert (await http.get("/api/v1/auth/me", headers=headers)).status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_reuse_revokes_the_whole_session():
    app.dependency_overrides.pop(get_current_user, None)
    email = await native_user()
    async with client() as http:
        pair = (await http.post("/api/v1/auth/login", json={"email": email, "password": "StrongPass123!"})).json()
        rotated = (await http.post("/api/v1/auth/refresh", json={"refresh_token": pair["refresh_token"]})).json()
        assert (await http.post("/api/v1/auth/refresh", json={"refresh_token": pair["refresh_token"]})).status_code == 401
        assert (await http.post("/api/v1/auth/refresh", json={"refresh_token": rotated["refresh_token"]})).status_code == 401
        assert (await http.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {rotated['access_token']}"})).status_code == 401


@pytest.mark.asyncio
async def test_logout_with_only_a_refresh_token_still_revokes():
    app.dependency_overrides.pop(get_current_user, None)
    email = await native_user()
    async with client() as http:
        pair = (await http.post("/api/v1/auth/login", json={"email": email, "password": "StrongPass123!"})).json()
        assert (await http.post("/api/v1/auth/logout", json={"refresh_token": pair["refresh_token"]})).status_code == 204
        assert (await http.post("/api/v1/auth/refresh", json={"refresh_token": pair["refresh_token"]})).status_code == 401


@pytest.mark.asyncio
async def test_long_passwords_register_and_log_in():
    app.dependency_overrides.pop(get_current_user, None)
    password = "é" * 60  # 120 bytes: beyond bcrypt's 72-byte input limit.
    email = f"long.{uuid.uuid4().hex[:6]}@example.com"
    async with client() as http:
        assert (await http.post("/api/v1/auth/register", json={"email": email, "password": password, "full_name": "Long"})).status_code == 201
        assert (await http.post("/api/v1/auth/login", json={"email": email, "password": password})).status_code == 200
        assert (await http.post("/api/v1/auth/login", json={"email": email, "password": "é" * 59 + "e"})).status_code == 401


# --- OI-08: auditing -------------------------------------------------------------

@pytest.mark.asyncio
async def test_audit_uses_the_verified_principal_including_clerk_style_users(pipeline):
    user = principal("recruiter")
    as_user(user)  # Stands in for any verifier (Clerk or native): no native JWT exists.
    async with client() as http:
        candidate_id, _ = await upload(http)
        await pipeline.drain()
        assert (await http.get(f"/api/v1/candidates/{candidate_id}", headers={"Authorization": "Bearer clerk-session"})).status_code == 200
        assert (await http.post("/api/v1/audit/export", json={"kind": "brief", "candidate_id": candidate_id})).status_code == 201
    async with session_factory()() as db:
        rows = (await db.scalars(select(AuditLog).where(AuditLog.candidate_id == candidate_id))).all()
    rows = [r for r in rows if r.user_id == user.id]
    views = [r for r in rows if r.action_type == "VIEW"]
    exports = [r for r in rows if r.action_type == "EXPORT"]
    assert views and views[0].user_id == user.id and views[0].workspace_id == "default" and views[0].status_code == 200
    assert len(exports) == 1 and exports[0].detail["kind"] == "brief"


@pytest.mark.asyncio
async def test_audit_write_failures_are_observable_and_retried(monkeypatch):
    calls = {"n": 0}
    original = audit_writer._insert

    async def flaky(rows):
        calls["n"] += 1
        if calls["n"] <= 2:
            raise RuntimeError("database unavailable")
        return await original(rows)
    before = audit_writer.stats()
    monkeypatch.setattr(audit_writer, "_insert", flaky)
    assert await audit_writer.record(endpoint="/candidates/X", method="GET", action_type="VIEW") is False
    assert audit_writer.stats()["failed_attempts"] > before["failed_attempts"] and audit_writer.stats()["buffered"] == 1
    assert await audit_writer.flush() is True and audit_writer.stats()["buffered"] == 0
    as_user(principal())
    async with client() as http:
        assert (await http.get("/health")).json()["audit"]["buffered"] == 0


# --- OI-09: canonical requirement IDs (backend contract) -------------------------

@pytest.mark.asyncio
async def test_created_job_returns_the_canonical_requirement_ids():
    as_user(principal())
    async with client() as http:
        created = (await http.post("/api/v1/jobs", json={"title": "Canonical IDs", "department": "Eng", "location": "Pune",
                   "description_raw": "Build Python services with Docker.",
                   "requirements": [{"id": "CLIENT-1", "requirement_text": "Python", "is_mandatory": True},
                                    {"id": "CLIENT-2", "requirement_text": "Docker", "is_mandatory": False}]})).json()
        fetched = (await http.get(f"/api/v1/jobs/{created['id']}")).json()
    assert [r["id"] for r in created["requirements"]] == [r["id"] for r in fetched["requirements"]]
    assert all(r["id"].startswith(created["id"]) for r in created["requirements"])


# --- OI-35: native OAuth hardening ------------------------------------------------

class Reply:
    def __init__(self, data): self.data = data
    def raise_for_status(self): return None
    def json(self): return self.data


def provider(monkeypatch, profile, emails=None):
    seen = {}

    class Client:
        async def __aenter__(self): return self
        async def __aexit__(self, *_): return None
        async def post(self, url, data=None, **_):
            seen["form"] = data
            return Reply({"access_token": "provider-token"})
        async def get(self, url, **_):
            return Reply(emails if url.endswith("/user/emails") else profile)
    monkeypatch.setattr("backend.routers.auth.httpx.AsyncClient", lambda **_: Client())
    return seen


@pytest.fixture
def google(monkeypatch):
    app.dependency_overrides.pop(get_current_user, None)
    monkeypatch.setattr(settings, "OAUTH_PROVIDER", "google")
    monkeypatch.setattr(settings, "OAUTH_CLIENT_ID", "client-id")
    monkeypatch.setattr(settings, "OAUTH_CLIENT_SECRET", type(settings.JWT_SECRET)("client-secret"))
    monkeypatch.setattr(settings, "OAUTH_REDIRECT_URI", "http://test/api/v1/auth/oauth/callback")


async def start(http):
    response = await http.get("/api/v1/auth/oauth/authorize", follow_redirects=False)
    query = parse_qs(urlparse(response.headers["location"]).query)
    assert query["code_challenge_method"] == ["S256"]
    return query["state"][0]


@pytest.mark.asyncio
async def test_oauth_state_is_bound_to_the_browser_and_single_use(google, monkeypatch):
    seen = provider(monkeypatch, {"sub": f"g-{uuid.uuid4()}", "email": f"g.{uuid.uuid4().hex[:6]}@example.com",
                                  "email_verified": True, "name": "G"})
    async with client() as http:
        state = await start(http)
        async with client() as other_browser:  # No binding cookie.
            assert (await other_browser.get("/api/v1/auth/oauth/callback", params={"code": "c", "state": state})).status_code == 400
        ok = await http.get("/api/v1/auth/oauth/callback", params={"code": "c", "state": state})
        # The rejected attempt above did not consume the state; this browser completes it once.
        assert ok.status_code == 200 and seen["form"]["code_verifier"]
        assert (await http.get("/api/v1/auth/oauth/callback", params={"code": "c", "state": state})).status_code == 400


@pytest.mark.asyncio
async def test_oauth_rejects_unverified_google_and_github_emails(google, monkeypatch):
    provider(monkeypatch, {"sub": "g-unverified", "email": "unverified@example.com", "email_verified": False})
    async with client() as http:
        state = await start(http)
        assert (await http.get("/api/v1/auth/oauth/callback", params={"code": "c", "state": state})).status_code == 422
    monkeypatch.setattr(settings, "OAUTH_PROVIDER", "github")
    provider(monkeypatch, {"id": 42, "login": "octo", "email": "public@example.com"},
             emails=[{"email": "public@example.com", "primary": True, "verified": False}])
    async with client() as http:
        state = await start(http)
        assert (await http.get("/api/v1/auth/oauth/callback", params={"code": "c", "state": state})).status_code == 422


@pytest.mark.asyncio
async def test_oauth_never_links_an_existing_account_by_email_alone(google, monkeypatch):
    email = await native_user()
    subject = f"g-{uuid.uuid4()}"
    provider(monkeypatch, {"sub": subject, "email": email, "email_verified": True, "name": "Same Email"})
    async with client() as http:
        state = await start(http)
        conflict = await http.get("/api/v1/auth/oauth/callback", params={"code": "c", "state": state})
        assert conflict.status_code == 409 and "access_token" not in conflict.text
        link_token = conflict.json()["link_token"]
        pair = (await http.post("/api/v1/auth/login", json={"email": email, "password": "StrongPass123!"})).json()
        headers = {"Authorization": f"Bearer {pair['access_token']}"}
        assert (await http.post("/api/v1/auth/oauth/link", headers=headers, json={"link_token": link_token})).json()["linked"] == "google"
        state = await start(http)
        assert (await http.get("/api/v1/auth/oauth/callback", params={"code": "c", "state": state})).status_code == 200


# --- OI-47: admin rebuild keeps durable jobs and candidates ----------------------

@pytest.mark.asyncio
async def test_admin_rebuild_keeps_custom_jobs_and_uploads_matchable(pipeline, monkeypatch):
    from pydantic import SecretStr
    monkeypatch.setattr(settings, "ADMIN_KEY", SecretStr("rebuild-key"))
    app.dependency_overrides[admin_routes.get_signal_cache] = lambda: SimpleNamespace(clear=lambda: None)
    try:
        as_user(principal())
        async with client() as http:
            created = await http.post("/api/v1/jobs", json={"title": "Rebuild Survivor", "department": "Eng",
                      "location": "Pune", "description_raw": "Build Python services on Kubernetes.",
                      "requirements": [{"id": "R-1", "requirement_text": "Python", "is_mandatory": True},
                                       {"id": "R-2", "requirement_text": "Kubernetes", "is_mandatory": False}]})
            assert created.status_code == 201, created.text
            job = created.json()
            candidate_id, _ = await upload(http)
            await pipeline.drain()

            as_user(principal("hr_admin"))
            rebuilt = await http.post("/seed/rebuild", headers={"X-Admin-Key": "rebuild-key"})
            assert rebuilt.status_code == 200, rebuilt.text
            await pipeline.drain()

            as_user(principal())
            listed = (await http.get("/api/v1/jobs")).json()
            assert job["id"] in {j["id"] for j in listed}
            extracted = await http.post("/api/v1/jd/extract", json={"job_id": job["id"]})
            assert extracted.status_code == 200, extracted.text
            assert [r["id"] for r in extracted.json()] == [r["id"] for r in job["requirements"]]
            ranked = await http.post("/api/v1/jd/rank", json={"job_id": job["id"]})
            assert ranked.status_code == 200, ranked.text
            assert candidate_id in {row["candidate_id"] for row in ranked.json()}
    finally:
        app.dependency_overrides.pop(admin_routes.get_signal_cache, None)
