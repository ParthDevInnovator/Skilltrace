# Mosaic — Beyond the Resume

AI-powered candidate intelligence platform that consolidates fragmented candidate information into a unified, evidence-backed profile.

---

## Architecture Overview

- **Frontend:** React 19, TypeScript, Vite, CSS design tokens and build-time Tailwind utilities.
- **Backend:** Python 3.12, FastAPI, Pydantic v2, Uvicorn.
- **Data & Ingestion:** Disk-backed mock seed stores $\to$ External Signal Fetchers (GitHub, LinkedIn, LeetCode) $\to$ Deterministic Evidence Scoring Engine.

---

## Quick Start

### 1. Prerequisites
- **Node.js:** v22.13+ (v24 recommended)
- **Python:** 3.11+ (tested on 3.12)

### 2. Initial Setup
The project uses a Python virtual environment in `.venv/` and Node dependencies in root and `frontend/`.

```powershell
# 1. Python virtual environment (if not already created)
python -m venv .venv
.\.venv\Scripts\pip install -r backend\requirements.txt

# 2. Node dependencies
npm install
npm --prefix frontend install
```

### 3. Run Development Servers
Start both backend (FastAPI) and frontend (Vite) concurrently with a single command:

```powershell
# Via npm
npm run dev

# Or via PowerShell script
.\dev.ps1
```

- **Frontend UI:** [http://localhost:5173](http://localhost:5173)
- **FastAPI Documentation (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Service Health Check:** [http://localhost:8000/health](http://localhost:8000/health)

---

## Available Scripts

| Script | Command | Description |
| :--- | :--- | :--- |
| `npm run dev` | `concurrently ...` | Runs backend & frontend servers concurrently |
| `npm run dev:backend` | `uvicorn backend.main:app ...` | Runs FastAPI server with auto-reload on port 8000 |
| `npm run dev:frontend` | `npm --prefix frontend run dev` | Runs Vite dev server on port 5173 |
| `npm run build:frontend` | `npm --prefix frontend run build` | Compiles TypeScript and builds production frontend bundle |
| `npm run test:backend` | `pytest backend/tests` | Runs backend unit and integration test suite |

---

## Project Structure

```text
├── backend/
│   ├── config.py           # Application settings via pydantic-settings
│   ├── main.py             # FastAPI app with CORS, lifespan & error handling
│   ├── models/             # Pydantic schemas (Job, CandidateSummary, etc.)
│   ├── routers/            # API endpoints (health, jobs, candidates)
│   ├── services/           # Business logic & seed loaders
│   ├── tests/              # Backend test suite (pytest + httpx)
│   ├── requirements.txt    # Python dependencies
│   └── pyproject.toml      # Python packaging configuration
├── frontend/
│   ├── src/
│   │   ├── components/     # UI components (dashboard, cards, layout, common)
│   │   ├── context/        # React contexts (ThemeContext, JobContext)
│   │   ├── services/       # Typed API client
│   │   ├── types/          # TypeScript interface definitions
│   │   ├── App.tsx         # Main application shell
│   │   └── index.css       # Design tokens & modern CSS system
│   ├── package.json        # Frontend dependencies
│   ├── tsconfig.json       # TypeScript configuration with @/* aliases
│   └── vite.config.ts      # Vite configuration & dev proxy
├── .env.example            # Environment template
├── dev.ps1                 # PowerShell startup script
└── package.json            # Root workspace scripts & tooling
```

## Phase 1 workspace

The Skilltrace frontend includes Overview, Jobs and Candidates screens, searchable job selection, session-only custom requisitions, candidate filters and seeded profile tabs. Custom JD uploads accept TXT, MD, PDF and DOCX up to 5 MB. Scanned PDFs without embedded text require pasted input.

Role fit remains unassessed; Phase 2 computes separate evidence strength with visible provenance. Evidence Explorer and resume text viewing are implemented in Phase 2. Interview briefs, digest export and authenticated accounts remain later phases. See [PHASE_1_TASKS.md](PHASE_1_TASKS.md) and [PRD.md](PRD.md).

## Verification

From `frontend/`:

```powershell
npm test
npm run lint
npm run build
npm run test:e2e
```

The browser suite uses installed Microsoft Edge at desktop and mobile widths and automatically starts Vite and a dedicated offline FastAPI test app (`backend.tests.browser_app:app`). The test app injects controlled synthetic signal adapters and a fixed clock; production remains `backend.main:app`. Install backend requirements and frontend dependencies first. Close conflicting servers on ports 5173/8000 or ensure running instances use this checkout. Browser tests include real PDF/DOCX fixtures and Axe accessibility scans. Reports/screenshots are written to ignored `frontend/test-results/`.

For a host environment that sets an unrelated `DEBUG` value, run backend tests with a process-local override:

```powershell
.\.venv\Scripts\python.exe -c "import os,pytest; os.environ['DEBUG']='false'; raise SystemExit(pytest.main(['backend/tests','-q','-p','no:cacheprovider']))"
```

## Phase 2 resume ingestion (Milestone 2)

`POST /api/v1/ingest/resume` accepts a multipart `file` in PDF, DOCX or TXT format, up to 5 MB. Optional `full_name`, `email`, `headline` and `location` form fields override extracted hints. A new candidate requires a name and valid email; missing fields produce 422 so the caller can correct them. Headline/location fall back to the explicit string `Not provided` when unknown. Scanned PDFs with fewer than 50 readable characters are rejected; OCR is not included.

```powershell
curl.exe -X POST http://localhost:8000/api/v1/ingest/resume -F "file=@resume.pdf" -F "full_name=Morgan Test" -F "email=morgan.test@example.com"
```

A successful response is HTTP 202 with `candidate_id`, `status: building`, `updated_existing`, `parse_source`, `context_revision` and `enrichment_pending: true`. Candidate records immediately appear in the existing candidate APIs. The response is an initial queued snapshot. Milestone 5 now launches the full context worker asynchronously: parsing/claims, external adapters and deterministic scoring eventually transition its internal state to ready or failed. The context endpoint supports polling through building/ready/failed responses.

Email matching trims whitespace and ignores case. Duplicate uploads update the existing candidate, preserve metadata not present in the new input and clear stale match/claim previews. Concurrent ingestion uses process-local locking and revision checks. Candidate records, original bytes and prepared context inputs exist in memory only: restarting the process or rebuilding seeds does not provide persistence. Run a single backend worker for this prototype.

The parser reads DOCX paragraphs/tables, detects TXT encodings, labels missing-file seed fallbacks as `stub` and reports parse failures without raising. Documents are bounded to 100,000 extracted characters, 200 PDF pages and 20 MB of expanded DOCX content.

## Phase 2 signal adapters (Milestone 3)

GitHub and LeetCode adapters accept a profile URL or username plus explicit `candidate_id` and `reference_date` arguments. They return attributed observations; they do not verify claims or generate a total evidence/role-fit score. Milestone 5 connects the adapters to uploaded and seeded candidate context builds.

Optional settings (see `.env.example`):

- `GITHUB_TOKEN`: backend-only token for public GitHub API calls. It is omitted when unset and never included in cache payloads or logs.
- `SIGNAL_CACHE_DIR`: disk-cache directory, default `backend/.cache/signals/`; ignored by Git.
- `SIGNAL_CACHE_TTL_SECONDS`: successful-response cache lifetime, default 21600 (six hours).
- `SIGNAL_HTTP_TIMEOUT_SECONDS`: per-request timeout, default 8 seconds.

The cache stores normalized observations and a UTC retrieval timestamp, not previously calculated candidate scores. Cache hits recompute weights using the supplied reference date and carry `disk_cache` provenance. Cache failures do not prevent network retrieval. HTTP, timeout and invalid-response failures return empty lists without overwriting successful cache entries. Synthetic fixtures are rejected by cache writes.

GitHub inspects up to 30 public repositories from the first 100 results, skips forks with fewer than 10 stars, and fetches the latest commit date for recency. Repository language/topic observations do not establish candidate authorship. Empty repositories are undated. API request shapes follow the [GitHub repository documentation](https://docs.github.com/en/rest/repos/repos#list-repositories-for-a-user) and [commit documentation](https://docs.github.com/en/rest/commits/commits#list-commits).

LeetCode uses best-effort public GraphQL `matchedUser.languageProblemCount` statistics. Each language with a positive solved count contributes one undated record; upstream errors or schema changes return no signals. Automated tests mock this contract and do not establish live service availability.

LinkedIn is local synthetic data only, with no live retrieval or scraping. See [fixture schema](backend/data/linkedin_stubs/README.md). There are no enabled LinkedIn sample profiles by default.

Fetcher integration tests use `httpx.MockTransport` and temporary disk caches; they make no real network requests.

## Phase 2 deterministic scoring (Milestone 4)

`backend/services/scoring_engine.py` exposes `compute_recency_multiplier(observation_date, reference_date)`, `score_evidence(records, reference_date)` and `evidence_label_for_score(score)`. Both dates are explicit; there is no clock lookup. Signal adapters share this recency implementation.

Scores recompute recency from observation dates at the requested reference date instead of trusting cached computed weights. Decimal products are summed under a local arithmetic context; inputs remain unchanged. `score_evidence` returns `(raw_float_score, EvidenceLabel)` and does not normalize role fit or verify claims. Zero-weight negative feedback contributes zero.

Calendar cutoffs are 6, 18 and 36 months, with exact cutoffs assigned to the older bucket and month-end dates clamped. Unknown/future dates use 0.7. Continuous score tiers are: 0 = No public evidence; (0, 2] = Limited; (2, 5] = Some; (5, 9] = Good; above 9 = Strong. Milestones 6-7 publish context data through the APIs and evidence workspace.

## Phase 2 background candidate contexts (Milestone 5)

`backend/services/context_builder.py` provides ContextBuilder and ContextBuildRegistry. Each candidate has a building/ready/failed state, revision, optional completed CandidateContext and error/unavailable-source metadata. Completed contexts combine original parsed text/source, unverified extracted claims, attributed signals and deterministic scores. Empty history/feedback lists remain explicit. Snapshots are defensive copies.

Lifespan initializes every candidate to building and schedules tracked tasks, then yields immediately. Workers wait for the first HTTP request (including `/health`) before starting; this guarantees that requests are accepted before any context completes. At most three candidate builds run concurrently, with all three signal adapters called concurrently within a build. Parsing and claim extraction run in worker threads. Every record and score shares the UTC date captured at build start, even if the build crosses midnight.

Normal unavailable-profile/network results are empty lists and can produce a ready context with No public evidence. An unexpected exception from one adapter preserves the other adapters' observations. Unexpected exceptions from all three adapters, or unrecoverable local processing failures, produce failed with a generic error. No claim is marked verified just because evidence exists. LinkedIn fixtures retain synthetic provenance; automated integration tests use controlled fixtures and never contact external services.

Uploads now schedule this full builder after responding 202. Candidate updates, publication and build revisions are checked under the repository lock so an older worker cannot overwrite a replacement upload. The prior staging-only callback has been removed. On shutdown, unfinished tasks are cancelled/joined and receive failed states. Context/status/resume endpoints and protected rebuild controls are available through Milestone 6.

## Phase 2 evidence workspace and API contracts

The sidebar Evidence Explorer filters candidate evidence by tier, source and minimum raw score. Candidate cards update from Unassessed after their context is ready. Profiles show unverified/reported claims separately from source observations and skill evidence. Resume Reference opens extracted text with its parse source, synthetic-stub notice and copy feedback. Candidates also includes a resume-upload form with optional name/email/location corrections.

| Method | Route | Result |
|:---|:---|:---|
| GET | `/api/v1/candidates/resolve?name=Alex` | Partial-name and/or exact-email matches; 422 without a nonblank input |
| GET | `/api/v1/candidates/{id}/context` | 200 context, 202 building (`Retry-After: 3`), 503 failed, 404 unknown |
| GET | `/api/v1/candidates/{id}/resume` | 200 text/source/character count, bodyless 204 when empty, 404 unknown |
| POST | `/seed/rebuild` | Protected seed/cache/context reset and background rebuild metadata |

All three GET routes also have `/candidates/...` aliases. The browser polls building contexts every three seconds for at most ten attempts, then offers manual retry. A failed fetch does not silently turn into zero evidence. Failed builds require a successful rebuild or replacement upload before their state can become ready.

Set a nonempty backend-only `ADMIN_KEY` in `.env` to enable the rebuild endpoint, and send it in `X-Admin-Key`. Without a configured key it returns 403; a missing/wrong header returns 401. Do not put this key in frontend code. An authorized reset cancels older workers, clears signal cache entries, reloads seed files and discards session-only uploaded candidates/resumes before starting new builds.

```powershell
curl.exe -X POST http://localhost:8000/seed/rebuild -H "X-Admin-Key: YOUR_ADMIN_KEY"
```

Synthetic fixture labels and observed source links remain visible throughout the UI. Finding a source record never changes a claim to supported automatically. Scores are evidence points, not role-fit percentages or hiring decisions. LeetCode live availability is not established by offline tests; LinkedIn remains a local synthetic adapter.

## Phase 2 verification sign-off (2026-10-26)

Phase 2 Tasks 1.1-8.4 are complete: **196 backend tests, 27 frontend tests and 18 desktop/mobile browser checks pass**, along with production build and lint. See [PHASE_2_TASKS.md](PHASE_2_TASKS.md) for implementation notes and evidence.

Browser checks use a dedicated controlled-adapter backend and fixed clock. Run the normal app with `npm run dev`; use `npm run test:e2e` from frontend for offline acceptance. Microsoft Edge must be installed. The test app is not a production deployment entry point. Live service availability remains separate from automated acceptance; LinkedIn is synthetic and candidate storage remains process-local.
