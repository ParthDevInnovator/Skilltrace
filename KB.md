# Knowledge Base — Skitrace

> Internal project knowledge base. Captures the project gist, the status of every
> work item (open / backlog / planned / completed), and the dates work landed.
>
> **Last compiled:** 2026-10-31
> **Source of truth:** `PRD.md`, `README.md`, `PHASE_1_TASKS.md` … `PHASE_5_TASKS.md`

---

## 1. Project Gist (the one-paragraph version)

**Skitrace** ("Trace Skills to Evidence") is an
AI-powered candidate intelligence platform for recruiters, talent acquisition
teams, and hiring managers. It pulls fragmented candidate signals — resumes, ATS
history, interview feedback, GitHub, LeetCode, LinkedIn — into a single
evidence-backed **CandidateContext**, scores that evidence with a **deterministic**
(non-LLM) math engine, matches candidates against job-description requirements, and
surfaces it all in a React recruiter workspace. An LLM layer adds grounded chat,
executive briefs, and interview questions, plus a Neo4j knowledge graph.

**Foundational principle:** Skitrace *informs* human hiring decisions with
transparent, verifiable evidence. It never automates hiring or rejection, and LLMs
explain evidence but never compute scores.

### The five questions the product answers
1. What does the candidate claim? (resume + projects)
2. What evidence supports the claim? (GitHub / LeetCode / interview notes)
3. How does that evidence map to the target role? (JD requirement coverage)
4. What is still unverified or unknown? (gaps, without assuming dishonesty)
5. What should the interviewer validate next? (gap-targeted questions)

### Tech stack
| Layer | Technology |
|:---|:---|
| Frontend | React 19, TypeScript, Vite, CSS design tokens + build-time Tailwind |
| Backend | Python 3.12, FastAPI, Pydantic v2, Uvicorn |
| AI providers | Google Gemini (primary), Groq (fallback), Ollama (local dev) |
| Graph | Neo4j Aura + Cognee (async background seeding) |
| Persistence | SQLAlchemy + Alembic migrations (prototype started on in-memory/JSON seeds) |
| Auth | JWT / OAuth2, role-based access control |

### Key architectural rules
- **Deterministic scoring is isolated from the LLM.** Scores are reproducible math.
- **Fail-soft everywhere.** Missing GitHub/LeetCode/LinkedIn or a dead Neo4j never
  crashes the pipeline; core context + scoring keep working.
- **No silent verification.** Finding an evidence record never flips a resume claim
  to "verified." Missing public signals are labeled *Unassessed / Needs validation*,
  never penalized.
- **LinkedIn is synthetic only** — local stub fixtures, no live scraping.

---

## 2. Status Summary (at a glance)

All five phases are **complete and verified**. Every task checkbox across the five
phase task files is checked `[x]`; there are **no open `[ ]` items** remaining.

| Phase | Theme | Status | Completed / Verified |
|:---:|:---|:---|:---|
| 1 | Recruiter workspace & foundation | ✅ Complete | 2026-10-26 |
| 2 | Candidate ingestion & evidence scoring | ✅ Complete | 2026-10-26 |
| 3 | JD matching, extraction & ranking | ✅ Complete | 2026-10-28 |
| 4 | Conversational AI & knowledge graph | ✅ Complete | 2026-10-29 |
| 5 | Production readiness, security & compliance | ✅ Complete | 2026-10-29 |

**Interpretation of issue buckets for this project:** work was tracked as
phase → milestone → task checklists rather than a ticket tracker. So:
- **Completed** = everything below (all phases).
- **Open / In-progress** = none at time of compile.
- **Backlog / Planned** = the explicitly deferred scope-decisions in §4.

---

## 3. Completed Work — by phase (with dates)

### Phase 1 — Skitrace Recruiter Workspace & Foundation
**Completed/verified 2026-10-26.**
Delivered the light-mode recruiter workspace backed by seeded APIs.
- Backend scaffolding: FastAPI, CORS, lifespan seed loading, Pydantic settings.
- Seed data: 5 jobs + 6 candidates; synchronous in-memory seed loader with search/filters.
- Implemented endpoints: `GET /health`, `GET /api/v1/jobs`, `/jobs/{id}`,
  `/api/v1/candidates`, `/candidates/{id}` (plus unprefixed aliases).
- Frontend shell: fixed 240px sidebar, 56px header, Overview / Jobs / Candidates
  views, searchable job selector, custom JD modal (session-only), candidate grid
  with filters, candidate profile tabs, TXT/MD/PDF/DOCX upload UI.
- Accessibility: focus trap, Escape/arrow-key nav, Ctrl/Cmd+K search, Axe WCAG A/AA.
- **Verification:** 37 backend tests, 5 frontend tests, 8 Playwright checks, build + lint pass.

### Phase 2 — Candidate Ingestion & Evidence Scoring Engine
**Created 2026-10-26, completed/verified 2026-10-26.** Tasks 1.1–8.4.
- Resume ingestion `POST /api/v1/ingest/resume` (PDF/DOCX/TXT, ≤5 MB, scanned-PDF reject, 202 building).
- Services: resume parser, identity extractor, deduplicator (email-based), claim extractor (≤20 claims).
- Signal fetchers: GitHub (REST, 30-repo cap, fork rules, real commit dates),
  LeetCode (public GraphQL, undated weight-1 records), LinkedIn (synthetic stub only).
- Disk cache layer with 6-hour TTL; synthetic fixtures bypass cache.
- **Deterministic scoring engine** (`scoring_engine.py`): explicit reference date,
  recency multipliers (1.0 / 0.7 / 0.4 / 0.2; undated/future = 0.7), continuous
  label tiers (No public evidence / Limited / Some / Good / Strong).
- Background context builder with building/ready/failed states, ≤3 concurrent builds.
- New endpoints: `/context`, `/resume`, `/resolve`, `POST /seed/rebuild` (admin-key gated).
- Evidence Explorer UI, EvidenceBar/EvidenceCard, ResumeViewer.
- **Verification:** 196 backend tests, 27 frontend tests, 18 browser checks, build + lint pass.

### Phase 3 — JD Matching, Requirement Extraction & Candidate Ranking
**Created 2026-10-26, completed/verified 2026-10-28.** Tasks 1.1–7.5.
- Requirement models + configurable skill taxonomy (longest-alias matching, e.g. React.js vs React).
- Rule-based requirement extractor (≤10 deduped requirements, mandatory/preferred).
- Requirement matcher + coverage classifier (Matched / Partial / Insufficient / Unassessed).
- **Dual-axis ranking:** `Final = 0.5 × Resume Fit + 0.5 × Evidence Strength`; 100% reproducible.
- Match store keyed by job + candidate + reference date, scoped to context revision.
- Endpoints: `/jd/extract`, `/jd/rank`, `/candidates/{id}/jd-match`, `/jd/similar`,
  `POST /api/v1/jobs` (process-local custom requisition creation).
- Frontend: LiveJDMatchingView, JDMatchTab, RequirementFilter, "Rank by fit".
- **Verification:** 253 backend tests, 37 frontend tests, 26 browser checks, build + lint pass.

### Phase 4 — Conversational AI Intelligence & Knowledge Graph
**Created 2026-10-28, completed/verified 2026-10-29.**
- LLM provider abstraction: Gemini primary, Groq fallback, configurable models/timeouts.
- Agent orchestrator with tool-calling loop (max 5 iterations); strict source-grounding.
- Grounded recruiter chat, four-section executive briefs, gap-targeted interview questions
  (citations validated against claim/evidence/requirement IDs before return).
- Neo4j client + background graph seeding (`GRAPH_SEEDING_ENABLED`); degrades gracefully.
- Endpoints: `/agent/chat`, `/candidates/{id}/brief`, `/interview-questions`, `/graph`, `/graph-evidence`.
- Frontend: ChatDrawer, BriefQuestionsTab, GraphVisualization.
- **Verification:** full backend/frontend/build/lint/Playwright suite (final counts in `PHASE_4_TASKS.md`).

### Phase 5 — Production Readiness, Security & Compliance
**Created 2026-10-29, completed/verified 2026-10-29.** Tasks 1.1–7.x.
- Persistence: SQLAlchemy ORM + Alembic migrations (`alembic upgrade head` / `make migrate`),
  connection pooling, idempotent seed script.
- Auth: JWT + refresh tokens, password hashing, OAuth2 entry points.
- **RBAC (cumulative roles):** Recruiter → Hiring Manager (masked PII) → HR Admin.
- Privacy/GDPR: `DELETE /api/v1/candidates/{id}` atomic erasure (204 success / 500 rollback);
  independent deletion-event audit; retention windows for cached signals.
- Security headers on every response: CSP, `X-Content-Type-Options`, `X-Frame-Options`.
- Evaluation suite: ranking-stability benchmark (100 identical results, p99 < 200 ms),
  extraction precision/recall, 50-user load check.
- **Verification (2026-10-29):** 355 backend tests, 65 frontend tests, 5 Playwright/axe
  scenarios. Load run: 1,103 req/endpoint, candidate-list p95 1,636.58 ms, ranking p95
  1,776.84 ms, 0% errors. Bundle scan found no leaked secrets or seeded emails.

---

## 4. Backlog / Planned / Deferred (open scope decisions)

No active tickets are open. The items below were **explicitly deferred** during the
build and remain the known backlog / future-scope list:

| Item | Origin | Status |
|:---|:---|:---|
| **Dark mode + persistent theme preference** | Phase 1 (ThemeContext/ThemeToggle retired) | Backlog — needs a scope decision; current UI is light-only |
| **OCR for scanned PDFs** | Phase 2 ingestion | Not planned — scanned PDFs with <50 chars are rejected |
| **Live LinkedIn retrieval** | Phase 2 signal fetchers | Not planned — LinkedIn stays synthetic stub only |
| **Role-based evidence weighting overrides** | PRD §7 risk mitigation (bias) | Planned mitigation, not yet an implemented control |
| **Managed/production deployment hardening & asset/font delivery** | Phase 5 | Partially addressed; production delivery verification is ongoing |
| **Multi-worker / horizontally-scaled ingestion** | Phase 2 note | Deferred — prototype expects a single backend worker |

> The Phase 1 "Follow-on Phase Tasks" table (resume parsing, external signals,
> JD extraction/ranking, brief/chat/graph, auth/RBAC/persistence) was the original
> backlog. **All of those items have since been delivered** in Phases 2–5.

---

## 5. Timeline (when things completed)

```
2026-10-26  Phase 1 complete & verified   (workspace, seeded APIs)
2026-10-26  Phase 2 complete & verified   (ingestion + deterministic scoring)
2026-10-28  Phase 3 complete & verified   (JD matching + dual-axis ranking)
2026-10-29  Phase 4 complete & verified   (LLM chat/brief/questions + graph)
2026-10-29  Phase 5 complete & verified   (persistence, auth, RBAC, GDPR, benchmarks)
```

PRD v1.2 reviewed 2026-10-26 ("implementation-aligned roadmap").

---

## 6. Quick Reference

### Run locally
```powershell
# setup
python -m venv .venv
.\.venv\Scripts\pip install -r backend\requirements.txt
npm install; npm --prefix frontend install

# run both servers
npm run dev            # or .\dev.ps1
```
- Frontend: http://localhost:5173
- API docs (Swagger): http://localhost:8000/docs
- Health: http://localhost:8000/health

### Test & verify
```powershell
npm run test:backend                 # pytest backend/tests
npm --prefix frontend test           # vitest
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:e2e   # Playwright (Edge), offline controlled-adapter backend
pytest backend/tests/benchmarks/     # ranking/extraction benchmarks
alembic upgrade head                 # apply DB schema (or: make migrate)
python -m backend.scripts.seed_db    # idempotent demo seed
```

### Config notes
- Secrets stay backend-only — never expose DB / JWT / OAuth / AI-provider / Neo4j
  values through a `VITE_` variable.
- `ADMIN_KEY` gates `POST /seed/rebuild` (sent via `X-Admin-Key`); unset ⇒ 403.
- AI features need `GEMINI_API_KEY` and/or `GROQ_API_KEY`; graph needs `NEO4J_*`.

### Repo map
```
backend/     FastAPI app, models, routers, services, repositories, migrations, tests
frontend/    React 19 + Vite workspace (components, context, services, types)
PRD.md       Product requirements & five-phase roadmap
PHASE_*.md   Per-phase task checklists + verification sign-offs
README.md    Setup, scripts, per-phase operational notes
```
