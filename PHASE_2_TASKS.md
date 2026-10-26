# Phase 2: Candidate Ingestion & Evidence Scoring Engine — Task List

**Created:** 2026-10-26
**Revised:** 2026-10-26
**Status:** In progress - Milestones 1 and 2 complete (Tasks 1.1-2.6); Milestone 3 onward remains planned.
**Objective:** Ingest unstructured resumes via an upload endpoint, extract candidate identity and claims, fetch and cache external signals (GitHub / LeetCode / LinkedIn stub), calculate deterministic evidence scores using the weighted formula from the PRD, and assemble a unified CandidateContext object. The finished pipeline powers real evidence badges, source-linked audit trails, and the Evidence Explorer view.

All Phase 1 tasks are complete and verified. Phase 2 builds on the existing FastAPI backend, seeded candidate models, and React 19 frontend shell. See [PRD.md](PRD.md) §Phase 2 for functional requirements, signal weights, and the scoring formula.

> **Review corrections applied (2026-10-26):** Ingestion flow, deduplication, identity extraction, and upload endpoint added (previously missing). Evidence and claim models extended with IDs, skill associations, provenance, application history, interview feedback, and project submission slots. Scoring thresholds use strictly continuous ranges with an explicit reference date. Context building runs in the background with explicit building / ready / failed states; startup is non-blocking. LinkedIn fixtures are labeled synthetic and tests use controlled fixtures rather than live profiles. The /resolve route is registered before the parameterised /{candidate_id} route. The cache-rebuild endpoint is disabled when no admin key is configured. The UI baseline is corrected: candidate cards currently show "Unassessed," not seeded evidence labels, and finding an evidence record does not mark the corresponding resume claim verified.

---

## Milestone 1: Backend — Dependencies, Models & Controlled Test Fixtures

- [x] **Task 1.1: Extend backend dependencies**
  - Added `pypdf>=4.0.0`, `python-docx>=1.1.0`, `chardet>=5.0.0`, `diskcache>=5.6.0`, and `python-multipart>=0.0.20` for the upcoming upload endpoint.
  - Kept `httpx>=0.27.0`; verified concurrent async GET/POST using `AsyncClient` and `MockTransport` without network access.
  - Synchronized `backend/requirements.txt` and runtime dependencies in `backend/pyproject.toml`; HTTPX is now a runtime dependency rather than dev-only.
  - Installed and verified in `.venv`: pypdf 6.21.2, python-docx 1.2.0, chardet 7.7.0, diskcache 5.6.3, python-multipart 0.0.32, HTTPX 0.28.1.
  - Verification (2026-10-26): `pip check` passes; real synthetic PDF/DOCX fixture extraction, text-encoding detection, temporary disk-cache round-trip, multipart import and async HTTP smoke checks pass; all 37 existing backend tests pass.
  - Version constraints specify minimum supported versions; they are not an exact lockfile.

- [x] **Task 1.2: Define ResumeClaim model** — `backend/models/context.py`
  - Each claim record must carry a stable unique ID, the candidate ID it belongs to, the raw claim text, the action-verb or keyword that triggered extraction, the section of the resume it came from (Experience / Projects / Education), an associated skill tag, and a provenance note describing how the claim was identified.
  - A claim must never be marked verified solely because an evidence record was found. Verification state is a separate explicit field with three values: unverified, supported, or contradicted.
  - Implemented and exported `ResumeClaim`, `ClaimSection`, and `ClaimVerificationState` from `backend.models`.
  - IDs use deterministic UUID5 over candidate ID, section and normalized claim text; persisted IDs can be supplied. Skill is nullable when unidentified, and Unknown is an explicit fallback section.
  - Extraction trigger and provenance are required nonblank strings. Verification defaults to unverified and accepts only unverified / supported / contradicted; unknown fields and invalid assignments are rejected.
  - Verification (2026-10-26): 15 new model checks cover stable identity, serialization, explicit assessment, missing skill/section fallback, blank metadata and invalid state/evidence input. All 52 backend tests pass.

- [x] **Task 1.3: Define EvidenceRecord model** — `backend/models/context.py`
  - Each record must carry a stable unique ID, the candidate ID it supports, the skill it relates to, the source type (github, leetcode, linkedin), a source URL, a human-readable observation string, the base signal weight from the PRD table, the recency multiplier as computed against an explicit reference date, the resulting computed weight, the observation date (nullable), and a provenance field indicating whether the record comes from a live fetch, a disk-cache hit, or a controlled synthetic fixture.
  - Interview feedback and project submission slots must be included in the source type enum from the start, even though populating them is planned work.
  - Implemented/exported `EvidenceRecord`, `EvidenceSourceType` and `EvidenceProvenance`. Records have deterministic IDs, HTTP(S) source URLs, skill/candidate associations, observation/reference dates, explicit provenance and finite nonnegative weights. Validation rejects inconsistent weight products. Source types include interview_feedback and project_submission for later integration.

- [x] **Task 1.4: Define CandidateContext model** — `backend/models/context.py`
  - The context wraps the existing CandidateDetail, a list of ResumeClaims, a list of EvidenceRecords, a continuous evidence score (float), the derived EvidenceLabel, the raw resume text, the parse source label, application history (list, empty for seeded candidates), previous interview feedback (list, empty for seeded candidates), the reference date used for all recency calculations in this context build, and a context_built_at UTC timestamp.
  - Export all new models from `backend/models/__init__.py`.
  - Implemented/exported `CandidateContext`, `ResumeParseSource`, `ApplicationHistory` and `InterviewFeedback`. Contexts preserve raw text/source, use independent history lists and normalize aware build timestamps to UTC. Validation rejects mixed candidate ownership, duplicate IDs, mismatched reference dates and text in an empty parse result. Evidence does not change claim verification.

- [x] **Task 1.5: Create controlled synthetic fixtures** — `backend/data/fixtures/`
  - Create one controlled fixture file per candidate (six total) containing a deterministic set of pre-defined EvidenceRecords with fixed observation dates, base weights, and expected computed weights.
  - These fixtures are the sole input used in scoring unit tests and context-builder integration tests. Live fetchers are not invoked during any automated test run.
  - Each fixture is clearly labeled with provenance: "synthetic — controlled test fixture."
  - Added six validated JSON fixtures and `backend/data/fixtures/README.md`. All use reference date 2026-10-26, fixed observation dates, synthetic provenance, reserved example.test source links and explicit per-record/total expectations. All five labels are represented, including an empty-evidence candidate. Fixtures are not loaded into live API data.

- [x] **Task 1.6: Stub resume text in seed JSON**
  - Add a plain-text resume excerpt field (minimum 200 characters) to each of the six candidate seed files.
  - The parser falls back to this stub when no file exists at the resume_path. The stub is labeled with source "stub" in all responses.
  - Added labeled `resume_text_stub` excerpts (200+ characters each) to all six seed candidates and declared the optional field on CandidateDetail so the seed loader retains it. Context tests label the fallback as stub. File parsing/fallback execution remains Task 2.2; no parser or ingestion endpoint is claimed here.


---

**Milestone 1 verification (2026-10-26):** All 79 backend tests pass, including 27 new evidence/context/fixture checks. JSON round-trips, deterministic observation IDs, validation failures, UTC timestamps, reference dates, unchanged claim verification, fixture arithmetic/labels and seed-loader stub retention are covered without network calls. Scoring and context-building services remain later tasks.

## Milestone 2: Backend — Resume Upload, Identity Extraction & Deduplication

- [x] **Task 2.1: Resume upload endpoint** — `backend/routers/ingest.py` (new file)
  - Accept a multipart file upload at `POST /api/v1/ingest/resume`.
  - Supported formats: PDF, DOCX, TXT. Reject any other format with a 422 response describing the accepted types.
  - Reject files larger than 5 MB with a 413 response.
  - Reject empty files or PDFs that yield fewer than 50 characters of text (scanned) with a descriptive 422 response.
  - On success, run identity extraction and deduplication synchronously, then enqueue a background context build task and return the resolved or newly created candidate ID along with the build status "building."
  - Completion: Implemented `POST /api/v1/ingest/resume` with multipart upload, bounded reads, 5 MB limit, PDF/DOCX/TXT validation, scanned-PDF rejection and 202 responses. Optional name/email/headline/location form fields correct extraction; missing name/email for a new candidate returns 422. Background local preparation retains a revisioned context input with status building and stage awaiting_enrichment; actual signals/scored context construction remains Milestones 3-5.


- [x] **Task 2.2: Resume parser service** — `backend/services/resume_parser.py`
  - Accept a file path, raw bytes, or the seed stub text.
  - Extract raw text from PDF, DOCX, and TXT. Detect encoding for plain text files.
  - Return the extracted text, the source label (pdf / docx / txt / stub / empty), and the character count.
  - Never raise an exception on a parse failure. Return source "empty" with an empty string and log a warning.
  - Completion: Implemented ParsedResume and fail-soft PDF/DOCX/TXT extraction from paths or bytes, explicit stub fallback for missing seed files, encoding detection, DOCX table text and scanned-PDF detection. Corrupt documents return source empty and a warning. Parsing has text/page/expanded-document bounds and runs outside the request event loop.


- [x] **Task 2.3: Identity extraction service** — `backend/services/identity_extractor.py`
  - From raw resume text, extract full name, email address, location, professional headline, and declared years of experience using rule-based patterns.
  - Extract GitHub, LinkedIn, and LeetCode profile URLs if present in the text.
  - Return all fields as nullable; partial extraction is valid.
  - Completion: Implemented nullable, rule-based identity hints for name/email/location/headline/declared experience and platform profile URLs. Explicit labels are preferred; profile links are normalized and repository links/spoofed hosts are not treated as identities. No LLM or network calls.


- [x] **Task 2.4: Deduplication service** — `backend/services/deduplicator.py`
  - Before creating a candidate record, check whether a candidate with the same email address already exists in the in-memory store.
  - If an exact email match exists, return the existing candidate ID and set a flag indicating the upload updated an existing record rather than creating a new one.
  - If no match is found, assign a new sequential candidate ID and create a new record.
  - Log the decision (new / duplicate) for every upload.
  - Completion: Implemented email normalization and atomic lookup/ID allocation/write under a repository lock. New candidates get sequential IDs; duplicate emails reuse IDs and preserve metadata absent from the upload. Uploaded documents clear stale match/claim previews and synthetic fallback text. New revisions supersede stale background preparation. Storage is process-local and not persistent.


- [x] **Task 2.5: Claim extractor service** — `backend/services/claim_extractor.py`
  - Identify resume bullet lines that contain action verbs from a configurable list (Designed, Built, Led, Engineered, Implemented, Deployed, Optimized, Architected, Reduced, Increased, and others) and known skill keywords.
  - Assign each claim to a section based on the nearest preceding heading.
  - Deduplicate claims by normalized text. Return at most 20 claims per resume.
  - Tag each claim with the skill most strongly associated with the line, if identifiable.
  - Completion: Implemented configurable action verbs/skill keywords, bullet and numbered-item extraction, heading-based section tags, normalized-text deduplication, longest matching skill heuristic and a 20-claim cap. Claims use stable IDs and remain unverified.


- [x] **Task 2.6: Unit tests** — `backend/tests/test_resume_pipeline.py`
  - Cover: PDF stub fallback, DOCX parse, TXT parse, scanned PDF detection, empty and missing path, oversized file rejection, format rejection, identity field extraction for name / email / GitHub URL, duplicate email detection returning existing ID, new candidate creation, claim extraction for at least three action verb patterns, section tagging, deduplication of identical claim text.
  - All tests use synthetic fixtures and no network access.
  - Completion: Added 16 offline pipeline scenarios covering real synthetic PDF/DOCX/TXT input, encodings, missing/stub/corrupt/scanned files, upload errors, correction fields, candidate API visibility, case-insensitive email updates, concurrency, stale revisions, claims/sections/configuration/cap and unverified states. All 95 backend tests pass (2026-10-26).


---

## Milestone 3: Backend — Signal Fetchers & Disk Cache

- [ ] **Task 3.1: Shared disk cache layer** — `backend/services/signal_fetchers/__init__.py`
  - Initialize a cache at a path configurable via settings, defaulting to `backend/.cache/signals/`.
  - Cache entries have a configurable TTL (default 6 hours for live fetches).
  - Controlled synthetic fixtures always bypass the cache and are never written to it.
  - Expose read and write helpers that the individual fetchers use.

- [ ] **Task 3.2: GitHub fetcher** — `backend/services/signal_fetchers/github.py`
  - Accept a GitHub profile URL or bare username.
  - Request the user's public repositories list using the GitHub REST API, with an optional token from settings.
  - For each repository, record the primary language (base weight 3), repository topic tags (base weight 2), and the most recent commit date to use as the observation date for recency calculations.
  - Cap processing at 30 repositories. Skip forks unless they have 10 or more stars.
  - On any network error, timeout, or non-200 response, return an empty list and log the failure. Never raise.
  - Cache the response under a key derived from the username.

- [ ] **Task 3.3: LeetCode fetcher** — `backend/services/signal_fetchers/leetcode.py`
  - Accept a LeetCode profile URL or bare username.
  - Query the public LeetCode GraphQL endpoint for the user's solved-problem counts by language.
  - Map each language entry to an EvidenceRecord with base weight 1 and a null observation date (undated, multiplier 0.7).
  - On any error, return an empty list and log. Never raise.
  - Cache the response under a key derived from the username.

- [ ] **Task 3.4: LinkedIn fetcher (controlled stub)** — `backend/services/signal_fetchers/linkedin.py`
  - LinkedIn provides no public API. This fetcher reads from a synthetic fixture file at `backend/data/linkedin_stubs/{candidate_id}.json` when present.
  - Every EvidenceRecord produced by this fetcher must carry provenance "synthetic — linkedin stub" to make clear it was not retrieved from LinkedIn.
  - When no fixture file exists, return an empty list. Never raise.
  - Document in the module header and in the README that live LinkedIn data retrieval is not implemented and that all LinkedIn records in this phase are synthetic.

- [ ] **Task 3.5: Signal fetcher integration tests** — `backend/tests/test_signal_fetchers.py`
  - All three fetchers are tested against mocked responses only. No real network calls are made.
  - GitHub tests: verify EvidenceRecord fields, recency multiplier values, fork skip logic, and graceful empty return on simulated HTTP error.
  - LeetCode tests: verify language-to-weight mapping and graceful empty return on simulated error.
  - LinkedIn stub tests: verify the fixture is read correctly, the provenance field says "synthetic," and the fetcher returns an empty list when no fixture is present.

---

## Milestone 4: Backend — Scoring Engine

- [ ] **Task 4.1: Recency multiplier function**
  - Accept an observation date and an explicit reference date (never use a hidden "today" default).
  - Apply the PRD multiplier table using strictly continuous, non-overlapping age ranges:
    - Strictly less than 6 months → 1.0
    - 6 months up to but not including 18 months → 0.7
    - 18 months up to but not including 36 months → 0.4
    - 36 months or more → 0.2
    - Null / undated → 0.7
  - Boundary dates (exactly 6, 18, or 36 months from the reference date) belong to the older bucket so no date falls in two ranges.

- [ ] **Task 4.2: Evidence scoring function**
  - Accept a list of EvidenceRecords and a reference date.
  - Compute raw score as the sum of (base weight × recency multiplier) for every record.
  - Map the raw score to an EvidenceLabel using the PRD thresholds. Decimal scores such as 0.7 or 2.8 are valid continuous values; the label is determined by which closed range they fall into:
    - 0 exactly → No public evidence
    - Greater than 0 up to and including 2 → Limited
    - Greater than 2 up to and including 5 → Some
    - Greater than 5 up to and including 9 → Good
    - Greater than 9 → Strong
  - Return both the raw float score and the label.
  - Pure function with no I/O, no side effects, and no hidden state.

- [ ] **Task 4.3: Scoring unit tests** — `backend/tests/test_scoring_engine.py`
  - Use only controlled synthetic fixture records with fixed dates and the same fixed reference date across all test cases.
  - Test all recency age buckets at an exact boundary date on each side to confirm the boundary belongs to the older bucket.
  - Test label assignment at 0, 0.5, 2, 2.1, 5, 5.1, 9, 9.1, and 15 to confirm continuous range handling.
  - Run the scoring function three times on the same input and assert all three outputs are identical (determinism check).
  - Confirm a signal with base weight 0 contributes 0 to the total regardless of its recency multiplier.

---

## Milestone 5: Backend — Context Builder & Background Build States

- [ ] **Task 5.1: Per-candidate build state tracker**
  - Maintain an in-memory registry mapping each candidate ID to one of three explicit states: building, ready, or failed.
  - Initialise all seeded candidates to "building" before any build starts.
  - Update the state to "ready" when the build completes successfully, or to "failed" if an unrecoverable error occurs.
  - Store the completed CandidateContext alongside its state. A "failed" entry must record an error message.

- [ ] **Task 5.2: Context builder service** — `backend/services/context_builder.py`
  - For a given candidate, run the resume parser, claim extractor, and all three signal fetchers.
  - Fetchers run concurrently. A failure in one fetcher must not abort the others or the overall build.
  - Pass a single reference date (the build start time) to every recency calculation so all multipliers in one context build share the same reference date.
  - After gathering all records, call the scoring function and assemble the full CandidateContext.
  - Update the state tracker to "ready" on success or "failed" with the error message on failure.

- [ ] **Task 5.3: Background build at startup** — `backend/main.py`
  - After the seed loader completes, schedule context builds for all seeded candidates as background tasks.
  - Startup must complete and the server must begin accepting requests before any build finishes.
  - Individual build failures must log the candidate ID and error without affecting other builds or server availability.

- [ ] **Task 5.4: Context builder integration tests** — `backend/tests/test_context_builder.py`
  - Use controlled synthetic fixtures for all fetchers. No live network calls.
  - Verify the assembled CandidateContext contains the expected claim count, evidence record count, score, label, and reference date.
  - Verify that one fetcher failing leaves the other fetchers' records intact and the build completes with state "ready."
  - Verify that the state transitions from "building" to "ready" during a successful build and to "failed" during a build where all fetchers raise.

---

## Milestone 6: Backend — New API Endpoints

- [ ] **Task 6.1: Route registration order** — `backend/routers/candidates.py`
  - Register the `/resolve` route **before** the `/{candidate_id}` parameterised route so the literal path segment is not swallowed by the parameter matcher.
  - This applies to both the versioned `/api/v1/candidates/resolve` and any unprefixed alias.

- [ ] **Task 6.2: Candidate context endpoint**
  - `GET /api/v1/candidates/{candidate_id}/context`
  - If the candidate ID is not found, return 404.
  - If the build state is "building," return 202 with a body containing the candidate ID and the status string "building." The frontend must handle 202 by polling or showing a skeleton.
  - If the build state is "failed," return 503 with the error message.
  - If the build state is "ready," return 200 with the full CandidateContext.
  - Add an unprefixed alias.

- [ ] **Task 6.3: Candidate resume endpoint**
  - `GET /api/v1/candidates/{candidate_id}/resume`
  - Return the raw resume text, the parse source label, and the character count.
  - Return 404 if the candidate is not found.
  - Return 204 if the candidate exists but parse source is "empty."
  - Add an unprefixed alias.

- [ ] **Task 6.4: Candidate resolve endpoint**
  - `GET /api/v1/candidates/resolve`
  - Accept query parameters for name and email (both optional, at least one required).
  - Match against seeded candidates by exact email or case-insensitive partial name match.
  - Return a list of matching CandidateSummary objects. Return an empty list when no match is found; never return 404.
  - Add an unprefixed alias.

- [ ] **Task 6.5: Cache rebuild endpoint** — `backend/routers/admin.py` (new file)
  - `POST /seed/rebuild`
  - When `settings.admin_key` is configured, require a matching `X-Admin-Key` header and return 401 if it is absent or wrong.
  - When `settings.admin_key` is not configured (not set in the environment), the endpoint must return 403 and a message explaining that it is disabled until an admin key is set. It must not be open in prototype mode.
  - On an authorised request, clear the signal disk cache, re-run the seed loader, and schedule background context rebuilds for all candidates. Return the rebuild timestamp, candidate count, and job count.

- [ ] **Task 6.6: API tests** — `backend/tests/test_context_api.py`
  - Context endpoint returns 202 while a build is in progress.
  - Context endpoint returns 200 with score and label fields after a build completes (use controlled fixture data, not live fetchers).
  - Resume endpoint returns 200 with non-empty raw text for a seeded candidate with a stub.
  - Resume endpoint returns 204 for a candidate with an empty parse result.
  - Resolve endpoint returns at least one result for a name that matches a seeded candidate.
  - Resolve endpoint returns an empty list for a name that matches no candidate.
  - Context endpoint returns 404 for an unknown candidate ID.
  - Rebuild endpoint returns 403 when no admin key is configured.
  - Rebuild endpoint returns 401 when an admin key is configured but the header is missing or wrong.
  - Extend the existing 37-test suite; total target is 55 or more passing tests.

---

## Milestone 7: Frontend — Evidence Components & Evidence Explorer

- [ ] **Task 7.1: TypeScript types** — `frontend/src/types/context.ts`
  - Define types for ResumeClaim (with ID, candidate ID, claim text, section, skill tag, provenance, verification state), EvidenceRecord (with ID, candidate ID, skill, source type, source URL, observation, base weight, recency multiplier, computed weight, observation date, provenance), CandidateContext (wrapping CandidateDetail with claim list, record list, score, label, resume text, parse source, reference date, context_built_at), and ResumePayload.
  - Verification state on a claim must be one of three string literals: unverified, supported, or contradicted. The UI must never infer "supported" from the presence of an evidence record; it must read this field explicitly.

- [ ] **Task 7.2: API service functions** — `frontend/src/services/api.ts`
  - Add a function that fetches a candidate's CandidateContext and returns the response body on 200, a build-in-progress object on 202, and throws on 4xx or 5xx.
  - Add a function that fetches a candidate's resume payload and returns the body on 200 or 204.
  - Add a function that calls the resolve endpoint with name or email parameters and returns the matching summary list.

- [ ] **Task 7.3: EvidenceBar component** — `frontend/src/components/evidence/EvidenceBar.tsx`
  - Render a segmented horizontal bar with five tiers: gray (No public evidence), yellow (Limited), blue (Some), indigo (Good), emerald (Strong).
  - The active tier and all tiers below it are highlighted; tiers above the active score are muted.
  - Animate fill on mount. Respect the prefers-reduced-motion media query.
  - Use ARIA meter role with the numeric score and label as accessible attributes.

- [ ] **Task 7.4: EvidenceCard component** — `frontend/src/components/evidence/EvidenceCard.tsx`
  - In its collapsed state, show the source type icon, a short observation summary, the computed weight, and the recency label.
  - In its expanded state, show the full observation text, a clickable source URL that opens in a new tab, the observation date or "Undated," the weight formula as plain text (base weight × recency multiplier = computed weight), and the provenance label. LinkedIn records must display the provenance "synthetic — linkedin stub" visibly.
  - Toggle between states on click or keyboard activation.

- [ ] **Task 7.5: ResumeViewer component** — `frontend/src/components/profile/ResumeViewer.tsx`
  - Fetch and display the candidate's raw resume text in a scrollable monospace area.
  - Show the parse source as a visible badge.
  - Provide a copy-to-clipboard button.
  - Wire to the existing Resume Reference action button in CandidateProfileShell, which is currently a no-op.

- [ ] **Task 7.6: Upgrade Evidence & Claims tab** — `frontend/src/components/profile/CandidateProfileShell.tsx`
  - Fetch the candidate context on tab open.
  - While the build state is "building" (202 response), show a loading skeleton and a status message. Poll at a reasonable interval (every 3 seconds, maximum 10 attempts) then fall back to a manual retry button.
  - On a "failed" (503) or network error, show an error state with a retry button.
  - On success, render the EvidenceBar and the list of EvidenceCards.
  - Render each ResumeClaim with its text, section tag, and verification state badge. The verification state badge must come from the claim's own verification_state field; never infer it from co-located evidence records.
  - The "Unverified preview" label currently present must remain until real evidence records exist for that candidate. When records exist, the label changes to "Evidence from external signals." The claim verification state badge is separate from this label.

- [ ] **Task 7.7: Upgrade Reported Skills tab**
  - Group evidence records by their skill field. For each skill, show the aggregated computed weight and the count of supporting records.
  - Retain the existing top_skills chip list. Add a sub-row per skill showing the evidence tier derived from its aggregated weight.

- [ ] **Task 7.8: Update CandidateCard evidence display**
  - The current cards show "Unassessed" for all candidates. That is the correct baseline.
  - After context is ready for a candidate, lazily replace "Unassessed" with the real evidence label.
  - Render a compact EvidenceBar below the skill chips when context is ready.
  - While context is still building, retain "Unassessed" without a spinner or badge change. Do not show a seeded evidence label from the seed JSON as if it were a computed result.

- [ ] **Task 7.9: Evidence Explorer view** — `frontend/src/components/evidence/EvidenceExplorer.tsx`
  - Activate the sidebar Evidence Explorer link, which is currently a Phase 2 placeholder.
  - List all candidates with their EvidenceBar, numeric score, label, and count of evidence records by source type.
  - Clicking a candidate navigates to their profile with the Evidence & Claims tab pre-selected.
  - Provide a filter bar: filter by evidence label tier, by source type (GitHub, LeetCode, LinkedIn), and by minimum score.
  - Show loading, error, and empty states with appropriate retry controls.

- [ ] **Task 7.10: Frontend interaction tests** — `frontend/src/test/`
  - EvidenceBar: verify meter role and aria attributes; verify correct tier highlighting at each PRD boundary score; verify animation class is absent when reduced-motion is set.
  - EvidenceCard: verify collapsed and expanded state render; verify source URL link is present in expanded state; verify LinkedIn records show the synthetic provenance label; verify keyboard activation toggles state.
  - ResumeViewer: verify text and source badge render with a mocked API response; verify copy button is present.
  - Evidence & Claims tab: verify loading skeleton while API returns 202; verify error state on 503; verify claim verification state badge reads from the claim field, not from evidence record presence.
  - EvidenceExplorer: verify tier filter reduces the displayed list; verify row click triggers navigation with the correct candidate ID.
  - Extend the existing 5 Vitest tests to 12 or more passing.

---

## Milestone 8: Verification & Sign-off

- [ ] **Task 8.1: End-to-end acceptance**
  - [ ] Server starts, accepts requests immediately, and completes background context builds for all 6 seeded candidates without crashing.
  - [ ] Context endpoint returns 202 while building and 200 after build completes.
  - [ ] Evidence & Claims tab shows a skeleton during building state, then switches to real records on ready.
  - [ ] Each EvidenceCard for a LinkedIn record shows the "synthetic — linkedin stub" provenance label.
  - [ ] Resume Reference button opens the ResumeViewer with non-empty text and the correct source badge.
  - [ ] Evidence Explorer sidebar link opens the new view; tier and source-type filters work correctly.
  - [ ] Candidate cards show "Unassessed" on initial load, then update to the real label once context is ready.
  - [ ] Simulating a fetcher failure (HTTP 500 from the mock) does not prevent the context build from completing with the other fetchers' data.
  - [ ] Rebuild endpoint returns 403 with no admin key configured.

- [ ] **Task 8.2: Determinism regression test**
  - Run the scoring function three times on the same controlled fixture input with the same reference date.
  - Assert that the raw score and the label are identical across all three runs.
  - This test must use fixture data only; live fetcher output must not be the input.

- [ ] **Task 8.3: Accessibility & responsive review**
  - EvidenceBar meter role and aria-label pass axe WCAG A/AA scan.
  - EvidenceCard keyboard toggle and focus-visible pass axe scan.
  - Evidence Explorer filter bar is usable at 390px mobile width without horizontal overflow.
  - Playwright smoke test: open Evidence Explorer, apply "Strong" tier filter, assert list count decreases.

- [ ] **Task 8.4: Update documentation**
  - Update `README.md` with Phase 2 setup: GITHUB_TOKEN environment variable (optional), signal cache path, LinkedIn stub fixture file format, and the admin key requirement for the rebuild endpoint.
  - Add `backend/data/linkedin_stubs/README.md` describing the stub file schema and the synthetic provenance requirement.
  - Update `backend/data/fixtures/README.md` describing the controlled fixture format and confirming that test suites use fixtures, not live data.
  - Mark this file Status: Complete and record final test counts.

---

## Follow-on Phase 3 Dependencies Exposed by Phase 2

| Phase 3 Task | What Phase 2 Provides |
|:---|:---|
| JD requirement extraction | ResumeClaim list (with skill tags and section) as structured input for requirement-vs-claim matching |
| Dual-axis ranking formula | Deterministic evidence_score as the evidence strength axis input |
| Requirement coverage display | EvidenceRecord.source_url as the per-requirement audit trail link |
| Card match preview | Real evidence_label replaces "Unassessed" only after a Phase 3 match score is computed; Phase 2 does not produce a fit score |

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
| LinkedIn headline / about mention (synthetic stub in Phase 2) | 1 |
| Negative previous interview feedback | 0 |

Recency multiplier — applied against an explicit reference date passed into every calculation:

| Age of observation (relative to reference date) | Multiplier |
|:---|:---:|
| Strictly less than 6 months | 1.0 |
| 6 months up to but not including 18 months | 0.7 |
| 18 months up to but not including 36 months | 0.4 |
| 36 months or more | 0.2 |
| Null / undated | 0.7 |

Boundary dates belong to the older bucket. A date exactly 6 months before the reference date uses multiplier 0.7, not 1.0.

Evidence label — applied to the continuous raw float score:

| Raw score range | Label | UI color |
|:---|:---|:---|
| Exactly 0 | No public evidence | Gray |
| Greater than 0 up to and including 2 | Limited | Yellow |
| Greater than 2 up to and including 5 | Some | Blue |
| Greater than 5 up to and including 9 | Good | Indigo |
| Greater than 9 | Strong | Emerald |

Decimal scores (e.g., 0.7, 2.8, 5.4) are valid and fall into the range that contains them. There are no undefined gaps.

---

## Review Evidence (to be filled on completion)

- Backend: pytest count (target ≥ 55 passing)
- Frontend: Vitest count (target ≥ 12 passing)
- Browser: Playwright smoke count (target ≥ 4 new scenarios)
- Determinism: 3× reproducibility assertion passing using controlled fixture data only
- Accessibility: axe WCAG A/AA scans on Evidence Explorer, upgraded Evidence & Claims tab, and EvidenceCard
- Provenance: Manual check confirming every LinkedIn EvidenceRecord in the UI displays the synthetic label
