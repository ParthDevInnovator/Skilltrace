# Knowledge Base — Skitrace

> One-stop project gist + work-item status (completed / open / backlog / planned) with dates.
>
> **Last compiled:** 2026-11-18 · **Branch at compile:** `redesign/ui-complete-functional-audit` (`98c3aae`)
> **Sources of truth:** `PRD.md`, `PHASE_1..5_TASKS.md`, `PRODUCT_DESIGN_AUDIT.md`,
> `REDESIGN_REPAIR_STATUS.md`, **`open-issues.md` (current backlog)**, git history.
>
> There is no external ticket tracker. Work was tracked as phase checklists (Oct) and then as
> audit issue lists (Nov). Issue IDs below (`OI-xx`) refer to `open-issues.md`.

---

## 1. Project gist

**Skitrace — "Trace Skills to Evidence"** is an AI-powered candidate-intelligence platform for
recruiters, TA teams and hiring managers. It merges fragmented candidate signals (resume, GitHub,
LeetCode, synthetic LinkedIn, interview notes) into one evidence-backed **CandidateContext**. A
**deterministic, non-LLM scoring engine** scores that evidence and matches it to job-description
requirements. Results appear in a React recruiter workspace. An LLM layer adds grounded chat,
executive briefs and gap-targeted interview questions. A Neo4j knowledge graph is also included.

**Core principle:** Skitrace *supports* human hiring decisions and never automates them. LLMs explain
evidence but never compute scores. Missing public evidence is shown as *Unassessed* and is never
penalised.

**The five questions it answers:**
1. What does the candidate claim?
2. What evidence supports it?
3. How does it map to the role?
4. What is still unverified?
5. What should the interviewer check next?

### Tech stack
| Layer | Tech |
|:--|:--|
| Frontend | React 19, TypeScript, Vite, CSS tokens + Tailwind; carbon/champagne redesign (15 screens) |
| Backend | Python 3.12, FastAPI, Pydantic v2, Uvicorn |
| Persistence | SQLAlchemy + Alembic (SQLite `mosaic.db` locally); **candidates/contexts still in-memory** (OI-01) |
| Auth | Clerk **Google-only** login (production UI); native JWT login for dev/tests; RBAC Recruiter → Hiring Manager (masked PII) → HR Admin |
| AI | Gemini (primary), Groq (fallback), Ollama (local) |
| Graph | Neo4j (+ background seeding behind `GRAPH_SEEDING_ENABLED`) |

### Key flows
`Login (Google/Clerk)` → `Overview dashboard` → `Jobs` → `Create job wizard (JD → requirements)` →
`Add candidates (resume upload → /ingest/resume, 202 building)` → `Pipeline analysis (poll context)` →
`Candidate results / ranking (Final = 0.5·Resume Fit + 0.5·Evidence Strength)` →
`Candidate dossier (overview, JD match, resume, brief & questions, graph, chat)` → `Comparison (≤3)`.
Also: Talent Pool, Evidence Explorer, Talent Discovery (unavailable).

### Repo map
```
backend/    FastAPI app: routers (admin, agent, auth, candidates, graph, health, ingest, jd, jobs),
            services (ingestion, scoring, matching, ranking, agent, llm, graph, signal_fetchers),
            models, repositories, migrations, tests (356)
frontend/   React app: components/{dashboard,profile,evidence,graph,agent,layout,cards,common},
            context, services, hooks, e2e (Playwright)
*.md        PRD, phase task lists, audits, open-issues backlog, API test report
```

---

## 2. Status at a glance (as of 2026-11-18)

| Bucket | Count | Notes |
|:--|:--:|:--|
| ✅ **Completed** | 5 phases + redesign + repair + 15 design-audit findings | Oct 17 → Nov 7, 2026 |
| 🔴 **Open (P1, production blockers)** | **10** | OI-01…OI-09, OI-35 |
| 🟠 **Open (P2, before functional sign-off)** | **37** | Matching, async/recovery, graph, product gaps, ops, tests |
| 🟡 **Open (P3, maintenance)** | **1** | OI-44 docs/legacy cleanup |
| 📋 **Planned** | 5 fix waves | Order defined in `open-issues.md`; **no dates committed** |
| 🗂️ **Backlog / deferred / not planned** | ~12 items | Dark mode, OCR, live LinkedIn, Microsoft SSO, magic link, etc. |

**Health signals (audit 2026-11-07):**
- Backend pytest: 356 passed.
- Frontend Vitest: 81 passed, **5 failed**.
- Playwright repair suite: **3 passed / 11 failed**, mostly stale locators.
- Build: passes.
- Lint: 5 warnings.

**Activity:** no commits since 2026-11-07 (11 days). Nothing from the 48-issue backlog has been
closed yet. `.test-tmp/` is untracked.

---

## 3. Timeline — what was completed when

| Date | Commit(s) | Milestone |
|:--|:--|:--|
| 2026-10-17 | `96ca4f6` | Repo created |
| 2026-10-25 | `ce64116`, `96ca54a` | Phase 1 foundation; mock data + seed loader |
| 2026-10-26 | `1463761`, `597526c` | ✅ **Phase 1** — recruiter workspace, seeded APIs (37 BE / 5 FE tests) |
| 2026-10-26 | `8b39029`, `3d706fe`, `22712ed` | ✅ **Phase 2** — resume ingestion, GitHub/LeetCode/LinkedIn-stub signals, deterministic scoring, evidence explorer (196 BE / 27 FE) |
| 2026-10-28 | `6660cee` | ✅ **Phase 3** — taxonomy, requirement extraction, coverage, dual-axis ranking (253 BE / 37 FE) |
| 2026-10-28 | `fe0e8bf` | ✅ **Phase 4** — LLM provider abstraction, agent, grounded chat, briefs, interview Qs, Neo4j graph |
| 2026-10-29 | `82f6d20` | ✅ **Phase 5** — SQLAlchemy/Alembic, JWT/OAuth, RBAC, GDPR erasure, security headers, benchmarks (355 BE / 65 FE) |
| 2026-10-31 | `8e88a34` | Renamed product to **Skitrace**; first KB |
| 2026-11-06 | `e603230`, `db5246c` | Bug-fix passes |
| 2026-11-06 | `0a1f1aa` | 15-screen UI redesign (mockup-matched). Audit found it relied on mock data |
| 2026-11-06 | — | `PRODUCT_DESIGN_AUDIT.md`: 15 findings (1 P0, 10 P1, 4 P2) |
| 2026-11-07 | `2ba2163` | ✅ **Redesign repair**: all 15 audit findings addressed (see §4.2) |
| 2026-11-07 | `dba5f96` | ✅ Google-only login (Clerk) + protected dashboard routes |
| 2026-11-07 | `7b3dc57`, `cdf86e4`, `d1191e5`, `98c3aae` | ✅ Redesigned overview/jobs, job creation, workspace, upload, analysis, results, intelligence screens |
| 2026-11-07 | `98c3aae` | 🔎 Full functional audit: **`open-issues.md` — 48 open issues** |

---

## 4. Completed work

### 4.1 Phases 1–5 (all checklist items `[x]`)
| Phase | Theme | Done |
|:--:|:--|:--|
| 1 | Recruiter workspace & foundation | 2026-10-26 |
| 2 | Ingestion & deterministic evidence scoring | 2026-10-26 |
| 3 | JD matching, extraction & ranking | 2026-10-28 |
| 4 | Conversational AI & knowledge graph | 2026-10-28/29 |
| 5 | Production readiness, security & compliance | 2026-10-29 |

Detail for each phase is in `PHASE_n_TASKS.md` and the `README.md` phase sections.

### 4.2 Redesign repair — closed 2026-11-07 (`PRODUCT_DESIGN_AUDIT.md` → `REDESIGN_REPAIR_STATUS.md`)
| # | Pri | Finding (06 Nov) | Resolution (07 Nov) |
|:--|:--|:--|:--|
| 01 | P0 | Default admin/demo session on login failure | Server-verified sessions; failed login stays signed out |
| 02 | P1 | Add Candidates never uploaded the file | Wired to multipart `/ingest/resume` + returned candidate ID |
| 03 | P1 | Pipeline progress was a timer | Polls actual context status; ready/error/retry |
| 04–07 | P1 | Hard-coded job workspace, Talent Pool, evidence and dossier data | Replaced with API-backed data |
| 08 | P1 | Comparison was fixed (Maya/Jonas) | Real comparison of up to 3 candidates |
| 09 | P1 | Fake discovery results | Marked unavailable |
| 10 | P1 | Wizard dropped structured fields | Skills persisted as requirements; other fields kept in JD text |
| 11 | P1 | "Request Evidence" did nothing | Marked unavailable |
| 12–15 | P2 | Fixed dashboard numbers, dead controls, SOC 2 claim, export naming | Removed or disabled; renamed to "Export brief" |

Verified at the time: 356 BE, 67 FE and 14/14 Playwright tests passed. This baseline no longer holds; see §2.

### 4.3 Mockup-gap items now done (BL items in `open-issues.md`)
- Google SSO, through Clerk (`pages/GoogleLogin.tsx`).
- Side-by-side comparison of up to 3 candidates. Persistence and recovery gaps remain: OI-14, OI-15, OI-16.
- Real resume upload and pipeline status polling. Per-stage telemetry remains open: OI-28.

---

## 5. Open issues (48) — audit 2026-11-07, all still open

Priority meanings: **P1** = fix before real candidate data. **P2** = fix before functional sign-off.
**P3** = maintenance.

### 🔴 P1 — production blockers (10)
| ID | Issue | Area |
|:--|:--|:--|
| OI-01 | Uploaded candidates/contexts lost on backend restart (in-memory) | Persistence |
| OI-02 | Multiple workers see inconsistent state (process-local stores) | Persistence / scale |
| OI-03 | Delete (GDPR) misses ingestion, context, match and graph stores; 404 for uploaded candidates | Privacy |
| OI-04 | Hiring-manager masking bypassable via `/resolve`, `/resume`, agent tools | RBAC |
| OI-05 | New sign-ups auto-get recruiter role; no workspace scoping | Access policy |
| OI-06 | Logout leaves refresh token valid; blacklist not persisted | Auth |
| OI-07 | Immediate reload after Sign out keeps user signed in | Auth (FE) |
| OI-08 | Clerk requests not audited; audit writes fail silently | Audit |
| OI-09 | Frontend/backend requirement IDs differ for new jobs, so comparison shows 0 matched | Matching |
| OI-35 | Native OAuth state not bound to the browser; `email_verified` not checked | Auth |

### 🟠 P2 — before functional sign-off (37)
| Group | IDs | Gist |
|:--|:--|:--|
| Matching & intelligence | OI-10, 11, 12, 18, 19 | Overview coverage math differs from JD Match. Unrelated claims downgrade coverage. Aliases (Kafka/Apache Kafka) not unified. Re-upload keeps stale skills and links. Source outages look like "no evidence" |
| Async refresh & comparison | OI-13, 14, 15, 16, 17 | Rankings never refresh after builds. Comparison contexts stay pending, retry is broken, and selections are lost. Brief belongs to the previously selected job |
| Knowledge graph | OI-20, 21, 22, 23 | Stale nodes after re-upload. Graph claims "contributed to" without proof. View modes are not real. Race between skill selections |
| Uploads & processing | OI-24, 25, 26, 27, 28, 29 | Batch shows "Complete" at HTTP 202. Queue keyed by filename. No in-place identity fix. Retry doesn't rebuild. Pipeline stages are inferred. No claim verification/contradiction engine |
| Unfinished product features | OI-30, 31, 32, 33 | No job↔candidate membership. No job status/edit/activity, and Jobs ID search is broken. NL discovery and evidence requests missing. No notifications/settings/admin UI |
| Auth, retention & ops | OI-34, 36, 37, 38, 39, 40, 41 | No automatic token refresh. Retention doesn't cover runtime stores. Synthetic filter not enforced. No rate or input limits. No URL state for reload/back. Dashboard hides partial failures. Export is incomplete |
| Verification & config | OI-42, 43, 45, 46, 47, 48 | 5 FE tests failing. 11 E2E tests failing and 5 lint warnings. File-size and requirement contracts mismatch (10 MB vs 5 MB). No deployment config or live smoke test. Admin rebuild drops custom jobs. Passwords over 72 bytes cause HTTP 500 |

### 🟡 P3 (1)
| OI-44 | Docs, legacy components and encoding mojibake disagree with the current product (README phase sections, old `CandidateGrid`/`LoginPage`) |
|:--|:--|

Full repro, sources and completion criteria for each issue are in `open-issues.md`.

---

## 6. Planned — fix order (from `open-issues.md`, no dates assigned)

| Wave | Scope | Issues |
|:--:|:--|:--|
| 1 | Persistence + permissions; decide single- vs multi-workspace access model | OI-01…08, OI-35 |
| 2 | Canonical requirement IDs, unified matching and skill state | OI-09…12, OI-18, OI-19 |
| 3 | Async recovery, batch tracking, comparison/brief state | OI-13…17, OI-24…29 |
| 4 | Graph attribution, revisions, job scope | OI-20…23 |
| 5 | Agreed product gaps + ops contracts, then a green test/doc baseline and live integration sign-off | OI-30…34, 36…48 |

> ⚠️ **No target dates or owners are recorded anywhere in the repo.** Add them here when agreed.
> Product decisions are needed before work starts on OI-05 (enrollment and workspace model), OI-11
> (coverage scoring policy), OI-32 (discovery and evidence-request scope) and OI-33 (in-app vs
> external admin).

---

## 7. Backlog / deferred / not planned

| Item | Origin | Status |
|:--|:--|:--|
| Dark mode + persisted theme | Phase 1 | Backlog; UI is light-only (redesign uses carbon/champagne) |
| OCR for scanned PDFs | Phase 2 | Not planned; scanned PDFs are rejected |
| Live LinkedIn retrieval | Phase 2 | Not planned; synthetic stub only |
| Role-based evidence-weight overrides (bias mitigation) | PRD §7 | Planned mitigation, not built |
| Microsoft / Azure AD SSO | Mockups | Not planned; login is Google-only |
| Passwordless magic-link email login | Mockups | Not planned |
| SOC 2 badge / legal pages | Mockups | Badge removed; Terms/Privacy pages still needed |
| Timeframe deltas + durable activity feed | Mockups (dashboard) | Backlog (related to OI-40) |
| Semantic/RAG talent discovery (vector search) | Mockups | Backlog (OI-32) |
| Request-evidence portal for candidates | Mockups | Backlog (OI-32) |
| Global evidence search + bulk export endpoint | Mockups | Backlog (OI-38, OI-41) |
| Scheduled profile re-crawl worker | Mockups (Talent Pool) | Backlog (OI-36) |
| SSE/WebSocket 8-stage pipeline + PDF preview | Mockups | Backlog (OI-28) |
| Batch ingestion queue (async worker) | Mockups | Partially built in the UI; backend queue missing (OI-24…26) |

---

## 8. Quick reference

```powershell
# setup
python -m venv .venv; .\.venv\Scripts\pip install -r backend\requirements.txt
npm install; npm --prefix frontend install
# run (FE http://localhost:5173, API docs http://localhost:8000/docs)
npm run dev            # or .\dev.ps1
# verify
.\.venv\Scripts\python.exe -c "import os,pytest; os.environ['DEBUG']='false'; raise SystemExit(pytest.main(['backend/tests','-q','-p','no:cacheprovider']))"
npm --prefix frontend test; npm --prefix frontend run lint; npm --prefix frontend run build
npm --prefix frontend run test:e2e:repair
alembic upgrade head   # or: make migrate
```
- Secrets stay on the backend only; never put them in `VITE_*` variables.
- AI features need `GEMINI_API_KEY` / `GROQ_API_KEY`. The graph needs `NEO4J_*` and
  `GRAPH_SEEDING_ENABLED`. `ADMIN_KEY` gates `/seed/rebuild`.
- The API walkthrough is in `API_FEATURE_TEST_REPORT.md`.

### Which document is current?
| Doc | Status |
|:--|:--|
| `open-issues.md` | ✅ **The single open-issues file**: tracker for OI-01…48 plus feature backlog BL-01…33 |
| `KB.md` (this file) | ✅ Current summary (2026-11-18) |
| `REDESIGN_REPAIR_STATUS.md` | Historical sign-off (Nov 7, before the audit); its test numbers are outdated |
| `PRODUCT_DESIGN_AUDIT.md` | Historical; all findings closed in `2ba2163` |
| `PRD.md`, `PHASE_*_TASKS.md` | Original spec and completed phase checklists |
