# Fix Phase 1: P1 Production Blockers - Task List

**Created:** 2026-11-18
**Status:** Not started
**Objective:** Close all 10 P1 issues from `open-issues.md` before any real candidate data is loaded:
durable storage, complete deletion, role enforcement, session security, auditing and canonical requirement IDs.

**Issues in scope:** OI-01, OI-02, OI-03, OI-04, OI-05, OI-06, OI-07, OI-08, OI-09, OI-35.
OI-09 belongs to Wave 2 in `open-issues.md`, but it is included here because it is P1.

**Decisions needed before starting:**
- **D1 (OI-05): DECIDED 2026-11-18**
  - **Multi-workspace.** Each organization sees only its own jobs and candidates.
  - **Admission = allowed domain + admin approval.** Emails from a workspace's allowed domains get recruiter access in that workspace automatically. Anyone else stays `pending` until an HR admin approves them.
  - **Native registration stays enabled in production.** It goes through the same admission rule as Google/Clerk sign-ups.
- **D2 (OI-02):** Choose between a shared multi-worker deployment (shared DB + queue + revocation store) or officially supporting **one worker only** for now.

As each issue closes, update its **Status** and **Closed** columns in `open-issues.md`.

---

## Milestone 1: Durable candidate storage (OI-01, OI-02)

### OI-01 - Uploaded candidate data disappears on backend restart
- [ ] **1.1** Add an Alembic migration with whatever the existing schema lacks (`backend/models/db.py`):
  - original resume storage (bytes or file path + hash) on `Candidate`
  - claims and observations (reuse `ResumeClaim` and `EvidenceRecord`)
  - build revision, status and error on `ContextBuildStatus`
  - a serialized `CandidateContext` payload
- [ ] **1.2** Wire `ResumeIngestionStore.upsert` (`backend/services/deduplicator.py`) to write through `CandidateRepository` inside a single transaction. Keep `SeedLoader` as a read cache only.
- [ ] **1.3** Make `context_builder.py` / `ContextBuildRegistry` save status changes (`building → ready | error`) and the finished context through `ContextRepository`. Move `pending_builds` resume bytes into persisted storage.
- [ ] **1.4** In `backend/main.py::lifespan`, restore candidates and contexts from SQL, the same way `restore_custom_jobs` restores jobs. Re-queue builds that were left in `building`, or mark them `error` so they can be retried.
- [ ] **1.5** Tests: upload through `/ingest/resume`, restart the app, and confirm `GET /candidates/{id}`, `/context` and `/resume` still return the same data.

### OI-02 - Multiple backend workers have inconsistent records
- [ ] **2.1** If D2 is one worker: enforce `--workers 1` in `dev.ps1`, the Makefile and the deploy config, log a startup warning when more workers are detected, and document this in the README. Then close the issue as "mitigated".
- [ ] **2.2** If D2 is multi-worker:
  - Make the SQL repositories the source of truth for jobs, candidates and contexts. In `routers/jd.py::find_job`, fall back to SQL whenever a lookup misses the in-memory cache.
  - Move background builds to a shared queue, with a DB-backed claim/lease on `ContextBuildStatus`.
  - Replace the process-local email lock with a DB unique constraint on normalized email, using upsert semantics.
  - Store `match_store.py` cache entries in a shared store keyed by context revision, or drop the cache.
  - Move token revocation to the DB. This is shared with OI-06.
- [ ] **2.3** Test: run two app instances against one DB, create a job on A, then upload, match and rank that job on B.

## Milestone 2: Complete deletion (OI-03)

### OI-03 - Deletion does not cover ingestion and graph stores
- [ ] **3.1** Create one `CandidateDeletionService` that removes the candidate, in order, from:
  - SQL (candidate, claims, evidence, matches, build status and chat rows)
  - `SeedLoader`/ingestion caches and `pending_builds`
  - `ContextBuildRegistry` and `match_store`
  - signal associations
  - Neo4j (`DETACH DELETE` the candidate node plus any orphaned nodes)
- [ ] **3.2** Cancel or invalidate in-flight builds for that candidate, with a revision check so a late-finishing task cannot write it back.
- [ ] **3.3** Point `routers/admin.py::_delete_candidate` at this service. Once OI-01 is done, uploaded candidates exist in SQL, so they no longer return 404.
- [ ] **3.4** Write an audit record for each erasure (depends on OI-08).
- [ ] **3.5** Test: upload a resume, delete the candidate, then confirm every store is empty and `/candidates/{id}`, `/context`, `/resume`, the graph and the agent tools return 404 or nothing.

## Milestone 3: Role enforcement (OI-04, OI-05)

### OI-04 - Hiring-manager masking can be bypassed
- [ ] **4.1** Centralize role-aware serialization in `backend/core/masking.py` with a single `serialize_candidate(candidate, user)` that every response uses.
- [ ] **4.2** Apply masking in `routers/candidates.py::resolve_candidates`, and deny `candidate_resume` to hiring managers (or return a redacted version).
- [ ] **4.3** Pass the caller's role into `services/agent/tools.py`. `lookup_candidate` returns masked data, and `get_candidate_context` is refused for managers, matching the existing `/context` rule.
- [ ] **4.4** Tests for the hiring-manager role on `/candidates`, `/candidates/{id}`, `/resolve`, `/resume`, `/context`, and agent chat calling each tool. None may return email, location, raw resume text or the raw context.

### OI-05 - New accounts get recruiter access without workspace admission (D1: multi-workspace, domain + approval)
- [ ] **5.1 Schema (Alembic migration):**
  - New `workspaces` table: `id`, `name`, `allowed_domains` (JSON list), `created_at`.
  - Add `workspace_id` (FK, indexed, NOT NULL after backfill) to `users`, `jobs`, `job_requirements` (through the job), `candidates`, `match_results`, `context_build_status`, `audit_logs` and `chat_history`.
  - New `membership_requests` table: `user_id`, `workspace_id`, `status` (`pending`/`approved`/`rejected`), `decided_by`, `decided_at`.
  - Backfill: create a `default` workspace and assign every existing row to it.
- [ ] **5.2 New `pending` role** in `core/roles.py`. It sits below recruiter, has no data access, and can only reach `/auth/me` and a "waiting for approval" endpoint.
- [ ] **5.3 Admission service** (`services/admission.py`), shared by native `register` (`routers/auth.py`) and first-time Clerk provisioning (`core/dependencies.py::get_current_user`, which currently hard-codes `roles=["recruiter"]`):
  - Normalize the email and take its domain. Native sign-ups must also verify their email before this rule applies; see 5.7.
  - If the domain matches exactly one workspace's `allowed_domains`, the user becomes a recruiter in that workspace.
  - Otherwise the user gets the `pending` role, no workspace, and a `membership_request` is created.
- [ ] **5.4 Approval endpoints** (HR admin only, limited to the admin's own workspace):
  - `GET /admin/membership-requests`
  - `POST /admin/membership-requests/{id}/approve` (sets workspace and role) and `POST /admin/membership-requests/{id}/reject`
  - `PATCH /admin/workspaces/{id}/domains` to edit allowed domains
  - Write an audit record for every decision.
- [ ] **5.5 Workspace scoping everywhere:**
  - Add a `current_workspace` dependency that comes from the authenticated user.
  - Every repository `get`/`list` takes `workspace_id` and filters by it. Cross-workspace IDs return 404, not 403, so the endpoint doesn't reveal that a record exists.
  - The in-memory caches (`SeedLoader`, `ContextBuildRegistry`, `match_store`) are keyed by `(workspace_id, id)`.
  - Agent tools receive the workspace along with the role (4.3).
  - Neo4j nodes carry a `workspace_id` property, and every Cypher query filters on it.
  - Ingestion de-duplicates by email **within** a workspace only.
- [ ] **5.6 Seeds and demo data** load into the `default` workspace only, and only outside production.
- [ ] **5.7 Native registration stays enabled in production (D1):** it uses the same admission service. Add email verification (token link) before domain auto-admission, otherwise anyone could register `x@allowed-domain.com` and get access without owning the address. Unverified native accounts stay `pending`. Add rate limiting on `/auth/register`.
- [ ] **5.8 Frontend:**
  - Add a "Pending approval" screen for users with the `pending` role.
  - Add an HR-admin page for membership requests (a minimal list with approve/reject).
  - Show the current workspace name in the header.
- [ ] **5.9 Tests:**
  - An allowed-domain Clerk user is admitted automatically.
  - An allowed-domain native user is `pending` until email is verified.
  - An outside-domain user is `pending` and gets 403 on candidate and job routes.
  - Admin approval grants access.
  - A user in workspace A gets 404 on B's jobs, candidates, `/resolve`, `/resume`, graph and agent tools.
  - An HR admin cannot approve requests for another workspace.

## Milestone 4: Sessions and login (OI-06, OI-07, OI-35)

### OI-06 - Native logout leaves refresh credentials valid
- [ ] **6.1** Add a `refresh_tokens` / session-family table holding `family_id`, `jti`, `user_id`, `expires_at`, `revoked_at` and `replaced_by`.
- [ ] **6.2** Rotate on every `/auth/refresh`: issue a new refresh token and revoke the old one. If an already-used token is presented again, revoke the whole family.
- [ ] **6.3** On `/auth/logout`, revoke the refresh family and blacklist the access token's JTI. Replace the in-memory `TokenBlacklist` (`core/security.py`) with DB storage (or Redis) that has TTL cleanup.
- [ ] **6.4** Tests: refresh after logout returns 401, reusing a rotated token revokes the family, and a revocation still holds after restart.

### OI-07 - Immediate reload can interrupt sign-out
- [ ] **7.1** In `frontend/src/context/AuthContext.tsx::logout`, capture the tokens, call `clear()` **first** (in the same tick), then send the revoke request with `keepalive: true` and the refresh token in the body. Ignore network errors.
- [ ] **7.2** Make sure Clerk sign-out also calls `clerk.signOut()` before navigation, and that protected routes redirect immediately once storage is empty.
- [ ] **7.3** Tests: a Vitest unit test checks that storage is empty right after `logout()` is called. A Playwright test signs out, reloads immediately and lands on `/login`. A second Playwright test covers sign-out while offline.

### OI-35 - Native OAuth state and email handling
- [ ] **35.1** Bind `state` to the initiating browser: set a signed, HttpOnly, SameSite=Lax cookie holding a state hash, and compare it in `oauth_callback`. Add PKCE.
- [ ] **35.2** Replace the global `_oauth_states` dict (`routers/auth.py`) with storage that expires entries (DB or TTL cache). Make each state single-use.
- [ ] **35.3** Require `email_verified == true` from Google. For GitHub, always use the `/user/emails` endpoint and accept only an address that is both primary and verified.
- [ ] **35.4** Link accounts by provider + subject ID, not email alone. Linking an existing email account should need an explicit confirmation step.
- [ ] **35.5** Tests: a missing or mismatched state cookie, replaying a used state, an expired state, an unverified Google email, and an unverified GitHub email.

## Milestone 5: Auditing (OI-08)

### OI-08 - Clerk requests are not audited
- [ ] **8.1** Have `get_current_user` save the verified principal on `request.state.user`. `backend/middleware/audit.py` reads it from there, so it no longer decodes the JWT with the native secret.
- [ ] **8.2** Stop silently ignoring audit write errors in `_write`:
  - log errors with full detail
  - retry or buffer failed writes
  - expose a failure counter in `/health`
- [ ] **8.3** Make `AuditLog.candidate_id` work for uploaded candidates, either by fixing the foreign key after OI-01 or by storing it as a plain indexed string.
- [ ] **8.4** Add `POST /audit/export` (or a server-side export endpoint), and call it from the frontend's "Export brief" and evidence export.
- [ ] **8.5** Tests: Clerk-authenticated and native requests both produce audit rows with the right user and role, export produces an `EXPORT` row, and a DB failure shows up in logs and metrics.

## Milestone 6: Canonical requirement IDs (OI-09)

### OI-09 - Frontend and backend requirement IDs differ for new jobs
- [ ] **9.1** In `frontend/src/context/JobContext.tsx::createCustomJob`, use `saved.requirements` (the server IDs such as `CUSTOM-…-REQ-001`) as-is. Keep the client-side requirements only for the extraction-failed UI flag.
- [ ] **9.2** Have `backend/routers/jobs.py::create_job` return the full canonical job, including requirements, so the client never has to guess.
- [ ] **9.3** Check that `CandidateComparisonView.tsx` and JD Match both join against the same requirement IDs.
- [ ] **9.4** Tests: create a job, compare candidates immediately and get non-zero matched counts, then reload and get the same counts. Add a backend test checking that the IDs in the create response equal those from `GET /jobs/{id}`.

---

## Exit criteria for Fix Phase 1
- [ ] All 10 P1 issues are marked `Fixed` (or OI-02 is `Mitigated` under D2) in `open-issues.md`.
- [ ] The backend pytest suite is green, including the new tests for each issue above.
- [ ] The new Playwright tests (sign-out reload, create-job-then-compare) pass.
- [ ] A manual run-through with a real upload succeeds: upload → restart → view → hiring-manager view (masked) → delete (every store cleared) → audit log shows each step.
- [ ] `KB.md` §2 and §5 are updated with the new counts.

## Suggested order
1. OI-07 and OI-09: small, frontend-only, can start now.
2. OI-01, then OI-03: OI-03 needs OI-01's persistence.
3. OI-06 and OI-35, then OI-02 (D2): revocation storage is shared.
4. OI-08: needs OI-01 for candidate foreign keys.
5. OI-04, then OI-05. D1 is decided. Do the OI-05 workspace migration (5.1) together with OI-01's migration (1.1), so the new candidate tables get `workspace_id` from the start.
