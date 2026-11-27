"""Wave 5: job lifecycle/editing/activity (OI-31), job membership (OI-30), job requirement
contracts (OI-45), and notifications, profile and audit review for the admin UI (OI-33)."""
import uuid

import pytest
from sqlalchemy import select

from backend.core.database import session_factory
from backend.core.security import hash_password
from backend.main import app
from backend.models.db import JobApplication, JobEvent, Notification, User
from backend.services.notifications import build_watches, on_build_finished
from backend.tests.test_fix_phase1 import as_user, client, count, pipeline, upload  # noqa: F401

REQUIREMENTS = [{"id": "x1", "requirement_text": "Python", "is_mandatory": True},
                {"id": "x2", "requirement_text": "Kubernetes", "is_mandatory": False}]
JOB = {"title": "Platform Engineer", "department": "Engineering", "location": "Pune",
       "description_raw": "Build Python services and run them on Kubernetes.", "requirements": REQUIREMENTS}


async def stored_user(role="recruiter", name=None, workspace="default", provider="native"):
    async with session_factory()() as db:
        user = User(email=f"{role}.{uuid.uuid4().hex[:8]}@example.com", full_name=name or role.title(),
                    hashed_password=hash_password("StrongPass123!"), roles=[role], workspace_id=workspace,
                    email_verified=True, auth_provider=provider)
        db.add(user)
        await db.commit()
        return user


async def create_job(http, **changes):
    response = await http.post("/api/v1/jobs", json={**JOB, **changes})
    assert response.status_code == 201, response.text
    return response.json()


# --- OI-45: the reviewed requirement list is what gets scored ---------------------------

@pytest.mark.asyncio
async def test_empty_requirement_list_is_rejected_not_silently_re_extracted(pipeline):
    as_user(await stored_user())
    async with client() as http:
        rejected = await http.post("/api/v1/jobs", json={**JOB, "requirements": []})
        assert rejected.status_code == 422
        extracted = await http.post("/api/v1/jobs", json={k: v for k, v in JOB.items() if k != "requirements"})
        assert extracted.status_code == 201 and extracted.json()["requirements"]
        too_long = await http.post("/api/v1/jobs", json={**JOB, "description_raw": "x" * 100_001})
        assert too_long.status_code == 422


@pytest.mark.asyncio
async def test_structured_fields_and_draft_status_are_stored(pipeline):
    as_user(await stored_user())
    async with client() as http:
        job = await create_job(http, status="draft", employment_type="Full-time", experience_range="3-6 years",
                               hiring_manager="Elena Marsh")
        assert (job["status"], job["employment_type"], job["experience_range"], job["hiring_manager"]) == \
            ("draft", "Full-time", "3-6 years", "Elena Marsh")
        assert job["is_custom"] and job["candidate_counts"] == {"total": 0, "analyzed": 0, "processing": 0, "failed": 0}
        assert [r["id"] for r in job["requirements"]] == [f"{job['id']}-REQ-001", f"{job['id']}-REQ-002"]
        drafts = (await http.get("/api/v1/jobs", params={"status": "draft"})).json()
        assert [j["id"] for j in drafts] == [job["id"]]
        activity = (await http.get(f"/api/v1/jobs/{job['id']}/activity")).json()
        assert [event["kind"] for event in activity] == ["created"]


# --- OI-31: search, editing, lifecycle and activity ----------------------------------------

@pytest.mark.asyncio
async def test_search_matches_job_id_and_requirement_text(pipeline):
    as_user(await stored_user())
    async with client() as http:
        job = await create_job(http, description_raw="A platform role for an experienced engineer.")
        by_id = (await http.get("/api/v1/jobs", params={"search": job["id"][:20].lower()})).json()
        assert job["id"] in {j["id"] for j in by_id}
        by_requirement = (await http.get("/api/v1/jobs", params={"search": "kubernetes"})).json()
        assert job["id"] in {j["id"] for j in by_requirement}


@pytest.mark.asyncio
async def test_edit_keeps_ids_of_unchanged_requirements_and_records_activity(pipeline):
    as_user(await stored_user())
    async with client() as http:
        job = await create_job(http)
        python_id = job["requirements"][0]["id"]
        edited = await http.patch(f"/api/v1/jobs/{job['id']}", json={
            "title": "Senior Platform Engineer", "hiring_manager": "  ",
            "requirements": [{"id": "ignored", "requirement_text": "Python", "is_mandatory": True},
                             {"id": "ignored", "requirement_text": "Terraform", "is_mandatory": True}]})
        assert edited.status_code == 200, edited.text
        body = edited.json()
        assert body["title"] == "Senior Platform Engineer" and body["hiring_manager"] is None
        ids = {r["requirement_text"]: r["id"] for r in body["requirements"]}
        assert ids == {"Python": python_id, "Terraform": f"{job['id']}-REQ-003"}
        assert body["updated_at"]
        # Matching uses the edited requirements straight away.
        extracted = (await http.post("/api/v1/jd/extract", json={"job_id": job["id"]})).json()
        assert {r["requirement_text"] for r in extracted} == {"Python", "Terraform"}
        unchanged = await http.patch(f"/api/v1/jobs/{job['id']}", json={"title": "Senior Platform Engineer"})
        assert unchanged.status_code == 200
        events = (await http.get(f"/api/v1/jobs/{job['id']}/activity")).json()
        assert [e["kind"] for e in events] == ["updated", "created"]
        assert set(events[0]["detail"]["fields"]) == {"title", "requirements"}
        assert (await http.patch(f"/api/v1/jobs/{job['id']}", json={"requirements": []})).status_code == 422


@pytest.mark.asyncio
async def test_bundled_jobs_are_read_only(pipeline):
    pipeline.repository.add_job(_bundled())
    as_user(await stored_user())
    async with client() as http:
        response = await http.patch("/api/v1/jobs/JOB-RO", json={"status": "closed"})
        assert response.status_code == 409 and response.json()["detail"]["code"] == "read_only"


def _bundled():
    from backend.models import Job
    return Job(id="JOB-RO", title="Bundled role", department="Engineering", location="Remote",
               description_raw="A bundled demonstration role.", requirements=REQUIREMENTS)


@pytest.mark.asyncio
async def test_status_change_by_a_teammate_notifies_the_creator(pipeline):
    creator, teammate = await stored_user(name="Casey Creator"), await stored_user(name="Tara Teammate")
    as_user(creator)
    async with client() as http:
        job = await create_job(http)
        as_user(teammate)
        closed = await http.patch(f"/api/v1/jobs/{job['id']}", json={"status": "closed"})
        assert closed.status_code == 200 and closed.json()["status"] == "closed"
        event = (await http.get(f"/api/v1/jobs/{job['id']}/activity")).json()[0]
        assert (event["kind"], event["actor_name"], event["detail"]) == \
            ("status_changed", "Tara Teammate", {"from": "active", "to": "closed"})
        assert (await http.get("/api/v1/notifications")).json()["unread_count"] == 0
        as_user(creator)
        inbox = (await http.get("/api/v1/notifications")).json()
        assert inbox["unread_count"] == 1 and inbox["items"][0]["job_id"] == job["id"]
        assert "closed" in inbox["items"][0]["title"]


# --- OI-30: job membership drives counts and job-scoped ranking ------------------------------

@pytest.mark.asyncio
async def test_upload_for_a_job_adds_the_candidate_and_scopes_ranking(pipeline):
    as_user(await stored_user())
    async with client() as http:
        job = await create_job(http)
        response = await http.post("/api/v1/ingest/resume", data={"job_id": job["id"]}, files={
            "file": ("a.txt", b"Name: Ana Member\nEmail: ana.member@example.com\nPython engineer.\n", "text/plain")})
        assert response.status_code == 202, response.text
        member = response.json()
        assert member["job_id"] == job["id"] and member["added_to_job"]
        outsider, _ = await upload(http)
        await pipeline.drain()

        detail = (await http.get(f"/api/v1/jobs/{job['id']}")).json()
        assert detail["candidate_counts"] == {"total": 1, "analyzed": 1, "processing": 0, "failed": 0}
        listed = (await http.get(f"/api/v1/jobs/{job['id']}/candidates")).json()
        assert [(row["candidate_id"], row["source"], row["context_status"]) for row in listed] == \
            [(member["candidate_id"], "upload", "ready")]
        scoped = (await http.post("/api/v1/jd/rank", json={"job_id": job["id"], "scope": "applicants"})).json()
        assert {row["candidate_id"] for row in scoped} == {member["candidate_id"]}
        pool = (await http.post("/api/v1/jd/rank", json={"job_id": job["id"]})).json()
        assert {member["candidate_id"], outsider} <= {row["candidate_id"] for row in pool}

        added = await http.post(f"/api/v1/jobs/{job['id']}/candidates", json={"candidate_id": outsider})
        assert added.status_code == 201 and added.json()["source"] == "manual"
        again = await http.post(f"/api/v1/jobs/{job['id']}/candidates", json={"candidate_id": outsider})
        assert again.status_code == 200
        assert (await http.delete(f"/api/v1/jobs/{job['id']}/candidates/{outsider}")).status_code == 204
        assert (await http.delete(f"/api/v1/jobs/{job['id']}/candidates/{outsider}")).status_code == 404
        kinds = [e["kind"] for e in (await http.get(f"/api/v1/jobs/{job['id']}/activity")).json()]
        assert kinds == ["candidate_removed", "candidate_added", "candidate_added", "created"]


@pytest.mark.asyncio
async def test_closed_or_unknown_jobs_reject_uploads_before_storing_anything(pipeline):
    as_user(await stored_user())
    async with client() as http:
        job = await create_job(http)
        await http.patch(f"/api/v1/jobs/{job['id']}", json={"status": "closed"})
        before = len(pipeline.repository.all_candidate_details())
        resume = {"file": ("c.txt", b"Name: Closed Job\nEmail: closed.job@example.com\nPython.\n", "text/plain")}
        closed = await http.post("/api/v1/ingest/resume", data={"job_id": job["id"]}, files=resume)
        assert closed.status_code == 409 and closed.json()["detail"]["code"] == "job_closed"
        missing = await http.post("/api/v1/ingest/resume", data={"job_id": "CUSTOM-missing"}, files=resume)
        assert missing.status_code == 404 and missing.json()["detail"]["code"] == "job_not_found"
        assert len(pipeline.repository.all_candidate_details()) == before
        candidate, _ = await upload(http)
        refused = await http.post(f"/api/v1/jobs/{job['id']}/candidates", json={"candidate_id": candidate})
        assert refused.status_code == 409


@pytest.mark.asyncio
async def test_other_workspaces_cannot_see_or_change_membership(pipeline):
    as_user(await stored_user())
    async with client() as http:
        job = await create_job(http)
        as_user(await stored_user(workspace="other-ws"))
        assert (await http.get(f"/api/v1/jobs/{job['id']}/candidates")).status_code == 404
        assert (await http.patch(f"/api/v1/jobs/{job['id']}", json={"status": "closed"})).status_code == 404
        assert (await http.get(f"/api/v1/jobs/{job['id']}/activity")).status_code == 404


@pytest.mark.asyncio
async def test_erasure_removes_membership_events_and_notifications(pipeline):
    admin = await stored_user("hr_admin")
    as_user(admin)
    async with client() as http:
        job = await create_job(http)
        response = await http.post("/api/v1/ingest/resume", data={"job_id": job["id"]}, files={
            "file": ("e.txt", b"Name: Erase Me\nEmail: erase.me@example.com\nPython engineer.\n", "text/plain")})
        candidate = response.json()["candidate_id"]
        await on_build_finished(pipeline.repository.get_candidate(candidate), "ready")
        assert await count(Notification, candidate_id=candidate) == 1
        assert (await http.delete(f"/api/v1/candidates/{candidate}")).status_code == 204
        for model in (JobApplication, JobEvent, Notification):
            assert await count(model, candidate_id=candidate) == 0


# --- OI-33: notifications, profile and audit review ------------------------------------------

@pytest.mark.asyncio
async def test_uploader_is_notified_when_analysis_finishes(pipeline):
    pipeline.finish_listeners.append(on_build_finished)
    uploader = await stored_user()
    as_user(uploader)
    async with client() as http:
        candidate, _ = await upload(http)
        await pipeline.drain()
        inbox = (await http.get("/api/v1/notifications")).json()
        assert inbox["unread_count"] == 1
        item = inbox["items"][0]
        assert (item["kind"], item["candidate_id"]) == ("analysis_ready", candidate)
        assert (await http.post(f"/api/v1/notifications/{item['id']}/read")).status_code == 204
        assert (await http.post(f"/api/v1/notifications/{item['id']}/read")).status_code == 404
        assert (await http.get("/api/v1/notifications")).json()["unread_count"] == 0
        as_user(await stored_user())
        assert (await http.get("/api/v1/notifications")).json()["items"] == []
    build_watches.clear()


@pytest.mark.asyncio
async def test_membership_requests_notify_hr_admins():
    from backend.services.admission import admit
    admin = await stored_user("hr_admin")
    async with session_factory()() as db:
        newcomer = User(email=f"new.{uuid.uuid4().hex[:6]}@outside.example", full_name="New Person",
                        hashed_password="x", roles=["pending"], email_verified=True)
        db.add(newcomer)
        await db.flush()
        assert await admit(db, newcomer) == "pending"
        await db.commit()
        notes = (await db.scalars(select(Notification).where(Notification.user_id == admin.id))).all()
    assert [note.kind for note in notes] == ["membership_request"]
    as_user(admin)
    async with client() as http:
        assert (await http.post("/api/v1/notifications/read-all")).json()["marked_read"] >= 1


@pytest.mark.asyncio
async def test_profile_name_can_be_changed_except_for_clerk_accounts():
    person = await stored_user(name="Old Name")
    as_user(person)
    async with client() as http:
        updated = await http.patch("/api/v1/auth/me", json={"full_name": "  New   Name "})
        assert updated.status_code == 200 and updated.json()["full_name"] == "New Name"
        assert updated.json()["auth_provider"] == "native"
        as_user(await stored_user(provider="clerk"))
        assert (await http.patch("/api/v1/auth/me", json={"full_name": "Other"})).status_code == 409


@pytest.mark.asyncio
async def test_audit_log_review_names_the_user(pipeline):
    admin = await stored_user("hr_admin", name="Audit Admin")
    as_user(admin)
    async with client() as http:
        await http.patch("/api/v1/auth/me", json={"full_name": "Audit Admin"})
        rows = (await http.get("/api/v1/admin/audit-logs", params={"action_type": "UPDATE_PROFILE",
                                                                    "user_id": str(admin.id)})).json()
        assert rows and rows[0]["user_email"] == admin.email and rows[0]["user_name"] == "Audit Admin"


@pytest.fixture(autouse=True)
def _reset_overrides():
    previous = dict(app.dependency_overrides)
    yield
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous)
