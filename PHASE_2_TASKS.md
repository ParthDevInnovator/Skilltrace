# Phase 2: Candidate Ingestion & Evidence Scoring Engine — Task List

**Created:** 2026-10-26
**Status:** Planned
**Objective:** Ingest unstructured resumes, fetch deterministic external signals (GitHub / LinkedIn / LeetCode), calculate evidence scores using the weighted formula defined in the PRD, and assemble a unified `CandidateContext` object that powers real evidence badges, audit trails, and the Evidence Explorer view.

All Phase 1 tasks are complete and verified. Phase 2 builds directly on the existing FastAPI backend, seeded candidate models, and React 19 frontend shell. See [PRD.md](PRD.md) §Phase 2 for functional requirements and scoring rules.

---

## Milestone 1: Backend — Dependencies & Models

- [ ] **Task 1.1: Install resume-parsing libraries**
  - Add `pypdf>=4.0` (PDF text extraction), `python-docx>=1.1` (DOCX), `chardet>=5.0` (encoding detection) to `backend/requirements.txt`.
  - `httpx` is already present; verify it covers async use for signal fetchers.
  - Add `diskcache>=5.6` for the signal cache layer.

- [ ] **Task 1.2: Extend `CandidateContext` Pydantic model** — `backend/models/context.py`
  - Define `ResumeClaim(BaseModel)`: `skill`, `claim_text`, `section` fields.
  - Define `EvidenceRecord(BaseModel)`: `source_type` (enum: `github` | `linkedin` | `leetcode`), `source_url`, `observation`, `base_weight` (float), `recency_multiplier` (float), `computed_weight` (float), `observation_date` (Optional[date]).
  - Define `CandidateContext(BaseModel)`: wraps `CandidateDetail` + `List[ResumeClaim]` + `List[EvidenceRecord]` + `evidence_score` (float) + `evidence_label` (EvidenceLabel) + `resume_text` (Optional[str]) + `context_built_at` (datetime).
  - Export all new models from `backend/models/__init__.py`.

- [ ] **Task 1.3: Stub resume text into existing seed JSON**
  - Add a `resume_text_stub` field to each of the 6 candidate JSON files (`CAND-001.json` … `CAND-006.json`) containing a short representative plain-text resume excerpt (≥ 200 chars).
  - This stubs the resume ingestion path without requiring actual PDF files in the repo; the parser falls back to this stub when no file exists at `resume_path`.

---

## Milestone 2: Backend — Resume Parser

- [ ] **Task 2.1: Implement `backend/services/resume_parser.py`**
  - `parse_resume(path: str | None, stub_text: str | None) -> ParsedResume`
  - Try PDF → DOCX → TXT by extension; fall back to `stub_text` if path is None or missing.
  - PDF: use `pypdf.PdfReader`; detect and report scanned PDFs (< 50 chars extracted) without raising.
  - DOCX: use `python-docx Document`; concatenate paragraph text.
  - TXT: open with `chardet`-detected encoding.
  - Return `ParsedResume(raw_text: str, source: Literal["pdf","docx","txt","stub","empty"], char_count: int)`.
  - Never raise on parse failure — return `source="empty"` with an empty string and log a warning.

- [ ] **Task 2.2: Implement claim extractor** — `backend/services/claim_extractor.py`
  - `extract_claims(raw_text: str) -> List[ResumeClaim]`
  - Rule-based extraction (no LLM in Phase 2): identify bullet lines containing action verbs (`Designed`, `Built`, `Led`, `Engineered`, `Implemented`, `Deployed`, `Optimized`, `Architected`, `Reduced`, `Increased`) and known skill keywords from a configurable keyword list.
  - Tag each claim with a `section` heuristic (Experience / Projects / Education) based on preceding heading detection.
  - Return at most 20 claims; deduplicate by normalized text.

- [ ] **Task 2.3: Unit tests** — `backend/tests/test_resume_parser.py`
  - Cover: PDF stub fallback, DOCX parse, TXT parse, scanned-PDF detection, empty/missing path, claim extraction for ≥ 3 action verb patterns, section tagging, deduplication.
  - All tests pass without network access.

---

## Milestone 3: Backend — Signal Fetchers & Disk Cache

- [ ] **Task 3.1: Shared cache layer** — `backend/services/signal_fetchers/__init__.py`
  - Initialize a `diskcache.Cache` at `backend/.cache/signals/` (path configurable via `settings`).
  - Expose `get_cached(key)` / `set_cached(key, value, ttl_seconds)` helpers.
  - Default TTL: 6 hours for live fetches; seed override stubs bypass the cache.

- [ ] **Task 3.2: GitHub fetcher** — `backend/services/signal_fetchers/github.py`
  - `fetch_github(username_or_url: str) -> List[EvidenceRecord]`
  - Resolve username from URL when a full URL is passed.
  - Call `GET https://api.github.com/users/{username}/repos?per_page=100` with optional `GITHUB_TOKEN` from settings (unauthenticated if not set).
  - Per repo: record primary language (weight 3), repo topics (weight 2), last commit date for recency multiplier.
  - Cap at 30 repos; skip forks unless they have ≥ 10 stars.
  - On any HTTP error or timeout → return `[]` and log; **never raise**.
  - Cache response under `github:{username}`.

- [ ] **Task 3.3: LeetCode fetcher** — `backend/services/signal_fetchers/leetcode.py`
  - `fetch_leetcode(username_or_url: str) -> List[EvidenceRecord]`
  - Use the public GraphQL endpoint `https://leetcode.com/graphql` with `userPublicProfile` + `languageStats` queries (no auth required for public profiles).
  - Map each language solved count → `EvidenceRecord(source_type="leetcode", base_weight=1, observation_date=None)`.
  - On any error → return `[]` and log.
  - Cache under `leetcode:{username}`.

- [ ] **Task 3.4: LinkedIn fetcher (stub)** — `backend/services/signal_fetchers/linkedin.py`
  - LinkedIn has no public API. Implement a **stub** that reads headline/about from a configurable JSON fixture at `backend/data/linkedin_stubs/{candidate_id}.json` if present.
  - `fetch_linkedin(profile_url: str, candidate_id: str) -> List[EvidenceRecord]`
  - Returns an `EvidenceRecord(source_type="linkedin", base_weight=1, observation="Headline from seeded stub")` if fixture exists, else `[]`.
  - Document clearly in code and README: live LinkedIn scraping is not implemented; placeholder exists for future OAuth integration.

- [ ] **Task 3.5: Signal fetcher integration tests** — `backend/tests/test_signal_fetchers.py`
  - GitHub: mock `httpx.AsyncClient.get` to return fixture JSON; verify EvidenceRecord fields, recency multiplier, fork skip logic, error fallback.
  - LeetCode: mock GraphQL response; verify language weight mapping and error fallback.
  - LinkedIn stub: write minimal fixture file; verify stub is read and returns correct record; verify graceful empty return when fixture is absent.
  - All tests use `pytest-asyncio` and no real network calls.

---

## Milestone 4: Backend — Scoring Engine & Context Builder

- [ ] **Task 4.1: Implement `backend/services/scoring_engine.py`**
  - `compute_recency_multiplier(observation_date: date | None) -> float`
    - < 6 months → 1.0 | 6–18 months → 0.7 | 18–36 months → 0.4 | > 36 months → 0.2 | None/undated → 0.7
  - `score_evidence(records: List[EvidenceRecord]) -> tuple[float, EvidenceLabel]`
    - Raw score = Σ(`base_weight` × `recency_multiplier`) per record.
    - Label thresholds: 0 → No public evidence | 1–2 → Limited | 3–5 → Some | 6–9 → Good | 10+ → Strong
  - Pure functions only — no I/O, no side effects; fully deterministic.

- [ ] **Task 4.2: Implement `backend/services/context_builder.py`**
  - `build_context(candidate: CandidateDetail) -> CandidateContext` (async)
    - Run `parse_resume`, `extract_claims`, and all three signal fetchers.
    - Fetchers run concurrently via `asyncio.gather`; individual failures must not abort the pipeline.
    - Call `score_evidence` on aggregated records.
    - Return fully assembled `CandidateContext` with `context_built_at=datetime.utcnow()`.
  - Add `build_all_contexts() -> Dict[str, CandidateContext]` that processes all seeded candidates and stores results in a module-level in-memory dict `_context_cache`.

- [ ] **Task 4.3: Wire context building into lifespan** — `backend/main.py`
  - After seed loader completes, call `await build_all_contexts()` in the FastAPI `lifespan` startup handler.
  - Log success/failure per candidate without blocking startup on individual failures.

- [ ] **Task 4.4: Unit tests** — `backend/tests/test_scoring_engine.py`
  - Verify all recency buckets return exact multipliers.
  - Verify label thresholds at boundary values (0, 1, 2, 3, 5, 6, 9, 10, 15).
  - Verify identical inputs always produce identical scores (determinism assertion run 3× in loop).
  - Verify negative-feedback signal (weight 0) contributes 0 to total.

- [ ] **Task 4.5: Integration test** — `backend/tests/test_context_builder.py`
  - Mock all three fetchers; verify assembled `CandidateContext` contains expected claim count, evidence records, score, and label.
  - Verify one fetcher failing does not prevent context build for the candidate.
  - Verify `context_built_at` is a recent UTC datetime.

---

## Milestone 5: Backend — New API Endpoints

- [ ] **Task 5.1: Add context & resume routes** — `backend/routers/candidates.py`
  - `GET /api/v1/candidates/{candidate_id}/context` → return `CandidateContext`; 404 if candidate not found; 202 with `{"status":"building"}` if context has not yet finished building.
  - `GET /api/v1/candidates/{candidate_id}/resume` → return `{"candidate_id", "raw_text", "source", "char_count"}`; 404 if empty.
  - `GET /api/v1/candidates/resolve?name=…&email=…` → fuzzy match against seeded candidates by full name or email; return matching `CandidateSummary` list.
  - Add unprefixed aliases at `/candidates/{id}/context`, `/candidates/{id}/resume`, and `/candidates/resolve`.

- [ ] **Task 5.2: Add cache rebuild route** — `backend/routers/admin.py` (new file)
  - `POST /seed/rebuild` → clears signal disk cache, re-runs seed loader and `build_all_contexts()`; returns `{"rebuilt_at": …, "candidate_count": …, "job_count": …}`.
  - Protect with a simple `X-Admin-Key` header matching `settings.admin_key` (optional env var); if unset, endpoint is open (prototype mode).

- [ ] **Task 5.3: API tests** — `backend/tests/test_context_api.py`
  - `GET /api/v1/candidates/CAND-001/context` returns 200 with `evidence_label` and `evidence_score` fields.
  - `GET /api/v1/candidates/CAND-001/resume` returns 200 with non-empty `raw_text`.
  - `GET /api/v1/candidates/resolve?name=Alex` returns at least one result.
  - `GET /api/v1/candidates/NONEXISTENT/context` returns 404.
  - `POST /seed/rebuild` returns 200 with correct shape.
  - Extend existing 37-test suite; total must reach ≥ 55 passing tests.

---

## Milestone 6: Frontend — Evidence Components & Evidence Explorer

- [ ] **Task 6.1: `EvidenceBar` component** — `frontend/src/components/evidence/EvidenceBar.tsx`
  - Props: `score: number`, `label: EvidenceLabel`, `showLabel?: boolean`.
  - Render a segmented horizontal bar with 5 tiers matching PRD color map: gray → yellow → blue → indigo → emerald.
  - Active tier glows; inactive tiers are muted. Animate fill on mount (respects `prefers-reduced-motion`).
  - Accessible: `role="meter"`, `aria-valuenow={score}`, `aria-label={label}`.

- [ ] **Task 6.2: `EvidenceCard` component** — `frontend/src/components/evidence/EvidenceCard.tsx`
  - Props: `record: EvidenceRecord`, `expanded?: boolean`.
  - Collapsed: source icon (GitHub / LeetCode / LinkedIn), observation summary, computed weight badge, recency label.
  - Expanded drawer: full observation text, source URL as external link, observation date, weight formula display (`base × recency = computed`).
  - Toggle expand/collapse with smooth CSS `max-height` transition.
  - Keyboard accessible: `Enter`/`Space` to toggle.

- [ ] **Task 6.3: Update `frontend/src/services/api.ts`**
  - Add `getCandidateContext(id: string): Promise<CandidateContext>`.
  - Add `getCandidateResume(id: string): Promise<ResumePayload>`.
  - Add `resolveCandidates(params: {name?: string; email?: string}): Promise<CandidateSummary[]>`.
  - Add TypeScript types `CandidateContext`, `ResumeClaim`, `EvidenceRecord`, `ResumePayload` in `frontend/src/types/context.ts`.

- [ ] **Task 6.4: Upgrade Evidence & Claims tab in `CandidateProfileShell.tsx`**
  - Replace static seeded claims list with live data from `getCandidateContext`.
  - Render each `ResumeClaim` with its text and section tag.
  - Below claims, render an `EvidenceBar` with real `evidence_score` and `evidence_label`.
  - Render an `EvidenceCard` per `EvidenceRecord` in a scrollable list.
  - Show a loading skeleton while context is building (202 response); show retry on error.
  - Remove the "Unverified preview" label when real records exist; preserve it only when `evidence_label === "No public evidence"`.

- [ ] **Task 6.5: Upgrade Reported Skills tab**
  - Group `EvidenceRecord` items by skill keyword overlap; show each skill with the aggregated evidence weight and matching record count.
  - Keep the existing top_skills chip list; add a sub-row showing evidence tier per skill.

- [ ] **Task 6.6: `ResumeViewer` component** — `frontend/src/components/profile/ResumeViewer.tsx`
  - Fetches `getCandidateResume(id)` on mount.
  - Renders resume raw text in a monospace scrollable card with a copy-to-clipboard button.
  - Shows parse source badge (`PDF` / `DOCX` / `TXT` / `Stub` / `Empty`) with appropriate muted indicator.
  - Wire to the existing **Resume Reference** action button in `CandidateProfileShell.tsx` (currently a no-op).

- [ ] **Task 6.7: Evidence Explorer view** — `frontend/src/components/evidence/EvidenceExplorer.tsx`
  - Top-level view routed from the sidebar "Evidence Explorer" link (currently Phase 2 placeholder).
  - Renders a list of all candidates, each with their `EvidenceBar`, score, label, and source count.
  - Clicking a row navigates to that candidate's profile pre-opened on the Evidence & Claims tab.
  - Includes a filter bar: filter by `evidence_label` tier, source type (GitHub / LeetCode / LinkedIn), and min score.
  - Loading and error states with retry.

- [ ] **Task 6.8: Update `CandidateCard` evidence preview**
  - Replace hardcoded `evidence_label` from seed JSON with the real label from `getCandidateContext` (lazy fetch).
  - Render a mini `EvidenceBar` (compact, no label text) below the skill chips.
  - Degrade gracefully: if context hasn't loaded, keep the existing seeded badge.

- [ ] **Task 6.9: Frontend interaction tests** — `frontend/src/test/`
  - `EvidenceBar`: verify meter role, correct tier activation at boundary scores, reduced-motion class applied when preference is set.
  - `EvidenceCard`: verify expand/collapse toggle, source URL link rendered, keyboard activation.
  - `ResumeViewer`: mock `getCandidateResume`; verify text render, source badge, copy button.
  - `EvidenceExplorer`: mock `getCandidateContext` for 2 candidates; verify filter by tier reduces list; verify row click triggers navigation.
  - Extend existing 5 Vitest tests; total must reach ≥ 12 passing.

---

## Milestone 7: Verification & Sign-off

- [ ] **Task 7.1: End-to-end acceptance**
  - [ ] Backend starts cleanly; lifespan builds contexts for all 6 seeded candidates without errors.
  - [ ] `GET /api/v1/candidates/CAND-001/context` returns a fully populated `CandidateContext` with `evidence_score > 0`.
  - [ ] `POST /seed/rebuild` clears cache and returns updated counts.
  - [ ] Evidence & Claims tab shows real records with expandable `EvidenceCard` entries and a live `EvidenceBar`.
  - [ ] Resume Reference button opens `ResumeViewer` with non-empty text and correct source badge.
  - [ ] Evidence Explorer sidebar link opens the new view; tier filter correctly limits the list.
  - [ ] Candidate cards in the pool show mini `EvidenceBar` without layout regression.
  - [ ] Fetcher failures (simulated with mock server returning 500) do not crash context build or UI.

- [ ] **Task 7.2: Determinism regression test**
  - Script or pytest fixture: fetch context for CAND-001 three times; assert `evidence_score` and `evidence_label` are identical across all three calls.

- [ ] **Task 7.3: Accessibility & responsive review**
  - `EvidenceBar` meter role and `aria-label` verified with axe.
  - `EvidenceCard` keyboard expand/collapse and focus visible confirmed.
  - Evidence Explorer filter bar accessible at 390px mobile width.
  - Playwright smoke test: open Evidence Explorer, filter to "Strong", verify reduced list.

- [ ] **Task 7.4: Update documentation**
  - Update `README.md`: add Phase 2 setup steps (`GITHUB_TOKEN` env var, signal cache path, LinkedIn stub fixture format).
  - Add `backend/data/linkedin_stubs/README.md` describing stub file format.
  - Mark this task file Status: **Complete** and record final test counts.

---

## Follow-on Phase 3 Dependencies Exposed by Phase 2

| Phase 3 Task | What Phase 2 Provides |
|:---|:---|
| JD requirement extraction | `CandidateContext.claims` as structured input for requirement-vs-claim matching |
| Dual-axis ranking formula | `evidence_score` (deterministic) as the Evidence Strength axis input |
| Requirement coverage display | `EvidenceRecord.source_url` as the per-requirement audit trail source |
| Card match preview replacement | Real `evidence_label` from context replaces seeded `match_preview.evidence_label` |

---

## Scoring Formula Reference (PRD §Phase 2)

| Signal Type | Base Weight |
|:---|:---:|
| Matching GitHub repo primary language | 3 |
| Verified project stack submission | 3 |
| Positive previous interview feedback | 3 |
| GitHub repo mention / readme topic | 2 |
| Recent active GitHub commit in skill | 2 |
| LeetCode activity in specific language | 1 |
| LinkedIn headline / about mention | 1 |
| Negative previous interview feedback | 0 |

| Recency | Multiplier |
|:---|:---:|
| < 6 months | 1.0 |
| 6–18 months | 0.7 |
| 18–36 months | 0.4 |
| > 36 months | 0.2 |
| Undated / unknown | 0.7 |

| Raw Score | Label | Color |
|:---|:---|:---|
| 0 | No public evidence | Gray |
| 1–2 | Limited | Yellow |
| 3–5 | Some | Blue |
| 6–9 | Good | Indigo |
| 10+ | Strong | Emerald |

---

## Review Evidence (to be filled on completion)

- Backend: `pytest` count (target ≥ 55 passing)
- Frontend: Vitest count (target ≥ 12 passing)
- Browser: Playwright smoke count (target ≥ 4 new scenarios)
- Determinism: 3× reproducibility assertion passing
- Accessibility: axe WCAG A/AA scans on Evidence Explorer, Evidence & Claims tab, EvidenceCard
