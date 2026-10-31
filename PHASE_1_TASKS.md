# Phase 1: Skitrace Recruiter Workspace - Task List

**Reviewed:** 2026-10-26
**Status:** Complete - implemented and verified on 2026-10-26.
**Objective:** Align the light-only Skitrace workspace with seeded job/candidate APIs and preserve active-requisition context.

All Phase 1 tasks below are implemented and verified. Later-phase work remains in the follow-on table. See [PRD.md](PRD.md) for the five-phase roadmap.

## Milestone 1: Project Foundation

- [x] **Task 1.1: Backend scaffolding** - FastAPI, CORS, lifespan seed loading, exception handling, Pydantic settings and dependencies in `backend/`.
- [x] **Task 1.2: Frontend scaffolding** - React 19, TypeScript, Vite, `@/*` aliases and component/context/service/type directories in `frontend/`.
- [x] **Task 1.3: Development setup** - Root scripts, `dev.ps1`, `.env.example` and quick-start documentation.

## Milestone 2: Seed Data & API

- [x] **Task 2.1: Schemas** - Job, candidate summary/detail and filter models in `backend/models/` with corresponding frontend types.
- [x] **Task 2.2: Seed records** - Five job JSON files and six candidate JSON files, including profile summaries, claims and external identifiers.
- [x] **Task 2.3: Seed loader** - Synchronous disk loading into an in-memory cache, lookup, job filters and candidate search/skill filters in `backend/services/seed_loader.py`.
- [x] **Task 3.1: Health** - `/health` and versioned health route with configuration and seed statistics.
- [x] **Task 3.2: Job endpoints** - `GET /api/v1/jobs` and `GET /api/v1/jobs/{job_id}`, plus unprefixed aliases.
- [x] **Task 3.3: Candidate endpoints** - `GET /api/v1/candidates` and `GET /api/v1/candidates/{candidate_id}`, plus unprefixed aliases.
- [x] **Task 3.4: Backend regression suite** - Model, seed, loader, health, job and candidate tests; 37 tests pass, including case-insensitive job-ID search.
- [x] **Task 3.5: Job-ID search parity** - Case-insensitive, trimmed ID matching now works in `SeedLoader.get_jobs` and has an API regression test.

## Milestone 3: Current Design & Workspace Shell

- [x] **Task 4.1: Light design system** - Purple/neutral tokens, white surfaces, evidence badge styles, Inter/JetBrains Mono, Material Symbols, focus-visible and reduced-motion rules in `index.css` and `index.html`.
- [x] **Task 4.2: Skitrace shell** - `App.tsx`, `Sidebar.tsx` and `Header.tsx` implement a fixed 240px sidebar, 56px header, breadcrumbs, job selector, global search and static recruiter identity.
- [x] **Task 4.3: Recruiter overview** - `DashboardOverview.tsx` contains metric cards, Create Job, active requisition details, requirement chips and Candidate Pool.
- [x] **Task 4.4: Distinct navigation views** - Jobs and Candidates have distinct screens. Evidence Explorer is labeled Phase 2 and does not masquerade as working navigation.
- [x] **Task 4.5: Adaptive shell** - Desktop sidebar adapts to mobile navigation; header, cards, profile and scrollable modal fit narrow viewports.
- [x] **Task 4.6: Honest preview states** - Available Jobs uses the actual list count. Activity metrics show unconnected states; fabricated counts and trends are removed.

**Scope change:** The old ThemeContext/ThemeToggle tasks are retired from the current baseline. The implemented UI is light-only, with no system-theme detection or localStorage theme preference. Dark mode requires a future scope decision.

## Milestone 4: Active Requisition & Custom JD

- [x] **Task 5.1: Job state** - `JobContext.tsx` fetches jobs, selects the first returned job, manages custom JD/search/skill/view state and preserves selection during candidate navigation within the mounted app.
- [x] **Task 5.2: Searchable job dropdown** - `JobSelector.tsx` filters by ID/title/department/location, shows active selection and metadata, closes on outside click and opens custom JD input.
- [x] **Task 5.3: Custom JD text flow** - `CustomJDModal.tsx` supports title/department, sample-fill, editable JD, word/character counts, required title and minimum 50-character description, then sets the new job active in React state.
- [x] **Task 5.4: Basic file-input UI** - Upload tab, file picker, filename display and lazy document extraction exist for TXT/MD/PDF/DOCX using PDF.js and Mammoth.
- [x] **Task 5.5: Job fetch feedback & clearing** - Selector, Jobs and Overview show loading/error feedback; retry and clear-selection controls work.
- [x] **Task 5.6: Upload behavior** - Drag/drop and file picker support TXT/MD/PDF/DOCX. Reject unsupported, empty and over-5-MB files; report extraction failures and scanned PDFs without text. Real PDF/DOCX extraction is browser-tested.
- [x] **Task 5.7: Location input** - Location has an associated editable input and is used when creating the active requisition.
- [x] **Task 5.8: Dialog/dropdown accessibility** - Dialog has semantics, labels, initial focus, focus trap/restoration and Escape close. Job picker supports Escape and arrow-key navigation among native controls.

**Persistence boundary:** Custom jobs have browser-memory lifetime only. There is no job-creation API call or reload persistence; backend/database persistence is Phase 5. Newline-based requirement previews are not semantic extraction (Phase 3).

## Milestone 5: Candidate Pool & Profile

- [x] **Task 6.1: Candidate cards** - `CandidateCard.tsx` shows initials, name/headline, location/ID, up to four skills with overflow count, seeded match/evidence previews and View Profile.
- [x] **Task 6.2: Candidate filtering** - `CandidateGrid.tsx` fetches API summaries with 150ms debounce, global search and skill filter; shows result count and reset/clear controls.
- [x] **Task 6.3: Grid states** - One/two/three-column utilities, six loading skeletons, error presentation and empty-state filter reset.
- [x] **Task 6.4: Candidate details** - `CandidateProfileShell.tsx` loads details with loading/error states, external links and Evidence & Claims / Reported Skills / Background Summary tabs.
- [x] **Task 6.5: Context-preserving return** - View Profile and Back to Recruiter Overview retain selected job/search/skill state in JobProvider during in-app navigation.
- [x] **Task 6.6: Missing-data honesty** - Cards show Role fit pending and Unassessed. Profiles label claims/links as seeded or unverified and show reported experience without fabricated defaults.
- [x] **Task 6.7: Search affordance** - Ctrl/Cmd+K opens Candidates and focuses search. Placeholder accurately describes candidate/skill search.

## Milestone 6: Verification & Sign-off

- [x] **Task 7.1: Frontend interaction tests** - Vitest, Testing Library and user-event cover job selection/clearing, custom JD validation/location, candidate filtering/reset, profile tabs, retained context, fetch failures and retries (5 tests).
- [x] **Task 7.2: Accessibility & responsive acceptance** - Playwright with Edge verifies keyboard selection, dialog focus/restoration, reduced-motion preference and narrow-screen overflow. Axe WCAG A/AA scans cover overview, Jobs, dropdown, modal and profile; text/badge contrast corrected.
- [x] **Task 7.3: End-to-end acceptance**
  - [x] Seed jobs load; switching/clearing jobs works and failures are visible.
  - [x] Custom text JD becomes active; upload formats match actual parsing capabilities.
  - [x] Candidate search/skill/reset and loading/error/empty states work.
  - [x] All profile tabs and return navigation work with selected job retained.
  - [x] Jobs/Candidates destinations behave as labeled; unsupported actions have clear states.
  - [x] Desktop and narrow-screen layouts and keyboard interactions pass review.
  - [x] Backend suite passes: 37 tests on 2026-10-26.

## Follow-on Phase Tasks Exposed by the Updated UI

| Phase | Remaining integration tasks |
|:---|:---|
| 2 | Parse resumes; fetch external signals; assemble candidate context; connect claims/skills to source-backed audit trails; implement Evidence Explorer and Resume Reference. External links alone do not verify a claim. |
| 3 | Extract JD requirements; recompute fit/evidence/ranking when active job changes; replace static card previews; implement requirement coverage and JD-match detail. |
| 4 | Wire Generate Interview Brief and Export Digest; add grounded questions/chat and graph exploration. Unavailable controls are disabled/labeled by phase rather than clickable no-ops. |
| 5 | Persist custom jobs; add auth/RBAC and real recruiter identity/profile/notifications; privacy/auditing and production deployment. Tailwind already compiles at build time; runtime CDN dependency removed. |

## Review Evidence

- Backend: 37 passing pytest tests (run with process-local `DEBUG=false` to avoid a host environment variable collision).
- Frontend: 5 passing Vitest interaction tests; TypeScript/production build and oxlint pass.
- Browser: 8 passing Playwright checks (4 scenarios at desktop/mobile widths). Playwright runs against local Vite and FastAPI servers, using Edge at desktop and 390px mobile widths. Failure/retry tests deliberately intercept only the failed job request.
- Uploads: Synthetic valid TXT, PDF and DOCX fixtures; invalid format, empty/oversized input and drag/drop checks.
- Accessibility: Axe WCAG A/AA scans plus keyboard, focus, reduced-motion and overflow assertions. Screenshots in ignored `frontend/test-results/` support visual review.
- Run commands are documented in README. Browser/API test results are the acceptance evidence; they do not establish completion of later intelligence or production phases.
