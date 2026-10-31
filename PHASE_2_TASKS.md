# Phase 2: Candidate Ingestion & Evidence Scoring Engine — Task List

**Created:** 2026-10-26
**Revised:** 2026-10-26
**Status:** Complete - Tasks 1.1 through 8.4 implemented and verified on 2026-10-26.
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
  - Completion: Implemented `POST /api/v1/ingest/resume` with multipart upload, bounded reads, 5 MB limit, PDF/DOCX/TXT validation, scanned-PDF rejection and 202 responses. Optional name/email/headline/location form fields correct extraction; missing name/email for a new candidate returns 422. Revisioned uploads now launch the full background context builder implemented in Milestone 5. The 202 response reports the initial building snapshot; context status is now published by the Milestone 6 endpoint.

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

- [x] **Task 3.1: Shared disk cache layer** — `backend/services/signal_fetchers/__init__.py`
  - Initialize a cache at a path configurable via settings, defaulting to `backend/.cache/signals/`.
  - Cache entries have a configurable TTL (default 6 hours for live fetches).
  - Controlled synthetic fixtures always bypass the cache and are never written to it.
  - Expose read and write helpers that the individual fetchers use.
  - Completion: Implemented lazy SignalCache plus shared get_cached/set_cached helpers. Successful normalized responses carry UTC retrieval timestamps and configurable six-hour expiry. Synthetic writes are rejected; failed reads/writes degrade gracefully. No cache directories are created just by importing modules. Cache artifacts are ignored by Git.

- [x] **Task 3.2: GitHub fetcher** — `backend/services/signal_fetchers/github.py`
  - Accept a GitHub profile URL or bare username.
  - Request the user's public repositories list using the GitHub REST API, with an optional token from settings.
  - For each repository, record the primary language (base weight 3), repository topic tags (base weight 2), and the most recent commit date to use as the observation date for recency calculations.
  - Cap processing at 30 repositories. Skip forks unless they have 10 or more stars.
  - On any network error, timeout, or non-200 response, return an empty list and log the failure. Never raise.
  - Cache the response under a key derived from the username.
  - Completion: Implemented async GitHub fetching with optional backend-only SecretStr token, strict profile validation, public-repository filtering, 30-repository cap, fork/star rules and bounded concurrent commit lookups. Uses actual latest-commit dates rather than repository metadata timestamps. Cached observations recompute recency for the supplied candidate/reference date. Empty repositories are undated; HTTP/timeout/malformed-response failures return no records and do not cache partial errors. Observation wording does not claim candidate authorship.

- [x] **Task 3.3: LeetCode fetcher** — `backend/services/signal_fetchers/leetcode.py`
  - Accept a LeetCode profile URL or bare username.
  - Query the public LeetCode GraphQL endpoint for the user's solved-problem counts by language.
  - Map each language entry to an EvidenceRecord with base weight 1 and a null observation date (undated, multiplier 0.7).
  - On any error, return an empty list and log. Never raise.
  - Cache the response under a key derived from the username.
  - Completion: Implemented async best-effort LeetCode languageProblemCount GraphQL fetching with validated usernames, positive solved-count records, one undated weight-1 observation per language and response caching. GraphQL errors, HTTP failures, timeouts and malformed payloads return no records. This public-service contract is mocked in tests; live availability is not established.

- [x] **Task 3.4: LinkedIn fetcher (controlled stub)** — `backend/services/signal_fetchers/linkedin.py`
  - LinkedIn provides no public API. This fetcher reads from a synthetic fixture file at `backend/data/linkedin_stubs/{candidate_id}.json` when present.
  - Every EvidenceRecord produced by this fetcher must carry provenance "synthetic — linkedin stub" to make clear it was not retrieved from LinkedIn.
  - When no fixture file exists, return an empty list. Never raise.
  - Document in the module header and in the README that live LinkedIn data retrieval is not implemented and that all LinkedIn records in this phase are synthetic.
  - Completion: Implemented local LinkedInFixture validation, candidate/profile matching, optional dated headline/about skill observations and explicit synthetic provenance. No network or cache is used. Added backend/data/linkedin_stubs/README.md; no default candidate fixtures are enabled.

- [x] **Task 3.5: Signal fetcher integration tests** — `backend/tests/test_signal_fetchers.py`
  - All three fetchers are tested against mocked responses only. No real network calls are made.
  - GitHub tests: verify EvidenceRecord fields, recency multiplier values, fork skip logic, and graceful empty return on simulated HTTP error.
  - LeetCode tests: verify language-to-weight mapping and graceful empty return on simulated error.
  - LinkedIn stub tests: verify the fixture is read correctly, the provenance field says "synthetic," and the fetcher returns an empty list when no fixture is present.
  - Completion: Added 29 offline checks in backend/tests/test_signal_fetchers.py using MockTransport and temporary real disk caches. Covers timestamps/TTL/expiry, corrupt/unavailable cache, synthetic exclusion, token headers, commit dates, recency boundaries, repo/fork limits, cached reference-date recomputation, HTTP/GraphQL/timeout errors, missing profiles, redirect rejection and LinkedIn fixture validation. All 124 backend tests pass (2026-10-26).

---

## Milestone 4: Backend — Scoring Engine

- [x] **Task 4.1: Recency multiplier function**
  - Accept an observation date and an explicit reference date (never use a hidden "today" default).
  - Apply the PRD multiplier table using strictly continuous, non-overlapping age ranges:
    - Strictly less than 6 months → 1.0
    - 6 months up to but not including 18 months → 0.7
    - 18 months up to but not including 36 months → 0.4
    - 36 months or more → 0.2
    - Null / undated → 0.7
  - Boundary dates (exactly 6, 18, or 36 months from the reference date) belong to the older bucket so no date falls in two ranges.
  - Completion: Consolidated compute_recency_multiplier in backend/services/scoring_engine.py; fetchers import the same function. Calendar-month cutoffs clamp month-end dates and include exact boundaries in the older bucket. Unknown/future dates use 0.7; no implicit current date is used.

- [x] **Task 4.2: Evidence scoring function**
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
  - Completion: Implemented pure score_evidence(records, reference_date) and evidence_label_for_score. Recomputes recency from observation dates instead of trusting stored weights, sums Decimal products under an isolated arithmetic context, and returns a float plus EvidenceLabel without mutating observations or claims. Continuous tiers have no gaps; invalid/non-finite scores are rejected.

- [x] **Task 4.3: Scoring unit tests** — `backend/tests/test_scoring_engine.py`
  - Use only controlled synthetic fixture records with fixed dates and the same fixed reference date across all test cases.
  - Test all recency age buckets at an exact boundary date on each side to confirm the boundary belongs to the older bucket.
  - Test label assignment at 0, 0.5, 2, 2.1, 5, 5.1, 9, 9.1, and 15 to confirm continuous range handling.
  - Run the scoring function three times on the same input and assert all three outputs are identical (determinism check).
  - Confirm a signal with base weight 0 contributes 0 to the total regardless of its recency multiplier.
  - Completion: Added 43 offline tests covering all calendar boundaries and adjacent days, leap/month-end cases, continuous label thresholds, all six controlled fixtures, three-run reproducibility, reversed input order, unchanged inputs, stale cached-weight recomputation, zero-weight feedback, explicit dates and Decimal-context isolation. All 167 backend tests pass (2026-10-26).

---

## Milestone 5: Backend — Context Builder & Background Build States

- [x] **Task 5.1: Per-candidate build state tracker**
  - Maintain an in-memory registry mapping each candidate ID to one of three explicit states: building, ready, or failed.
  - Initialise all seeded candidates to "building" before any build starts.
  - Update the state to "ready" when the build completes successfully, or to "failed" if an unrecoverable error occurs.
  - Store the completed CandidateContext alongside its state. A "failed" entry must record an error message.
  - Completion: Implemented ContextBuildRegistry and immutable state snapshots with building/ready/failed, revision tokens, completed contexts, generic error messages and unavailable-source metadata. All candidate states initialize before workers are scheduled. Stale completions are rejected and callers receive defensive context copies.

- [x] **Task 5.2: Context builder service** — `backend/services/context_builder.py`
  - For a given candidate, run the resume parser, claim extractor, and all three signal fetchers.
  - Fetchers run concurrently. A failure in one fetcher must not abort the others or the overall build.
  - Pass a single reference date (the build start time) to every recency calculation so all multipliers in one context build share the same reference date.
  - After gathering all records, call the scoring function and assemble the full CandidateContext.
  - Update the state tracker to "ready" on success or "failed" with the error message on failure.
  - Completion: Implemented ContextBuilder and build_context in backend/services/context_builder.py. Seed paths/stubs and uploaded parsed inputs feed claim extraction, concurrent adapters and deterministic scoring. One UTC build-start date is shared across records and scoring. Duplicate evidence IDs are collapsed, ownership is checked, and claim verification remains unverified. Revision checks protect both registry and candidate publication; upload responses schedule detached, lifecycle-tracked work.

- [x] **Task 5.3: Background build at startup** — `backend/main.py`
  - After the seed loader completes, schedule context builds for all seeded candidates as background tasks.
  - Startup must complete and the server must begin accepting requests before any build finishes.
  - Individual build failures must log the candidate ID and error without affecting other builds or server availability.
  - Completion: Lifespan schedules all builds without awaiting network or parsing work. A readiness gate opens on the first received HTTP request, proving the server accepts traffic before workers can finish. Candidate concurrency defaults to three. Shutdown cancels and joins tracked tasks and marks unfinished states failed; one candidate failure does not affect others.

- [x] **Task 5.4: Context builder integration tests** — `backend/tests/test_context_builder.py`
  - Use controlled synthetic fixtures for all fetchers. No live network calls.
  - Verify the assembled CandidateContext contains the expected claim count, evidence record count, score, label, and reference date.
  - Verify that one fetcher failing leaves the other fetchers' records intact and the build completes with state "ready."
  - Verify building-to-ready on success and building-to-failed on unrecoverable local errors or unexpected exceptions from all three adapters. Normal unavailable-profile/network failures return empty adapter results and can still produce a ready, zero-evidence context.
  - Completion: Added 18 offline context/state tests using the six controlled fixtures and injected adapters/clock. Covers context contents/scores/claims/source/reference dates, concurrent retrieval, building-to-ready/failed, partial failures, zero-evidence readiness, all unexpected adapter errors, parser failure, HTTP readiness, sibling isolation, shutdown, duplicate records, defensive snapshots, stale-upload races and a build spanning UTC midnight. Updated ingestion tests for actual background context completion. All 185 backend tests pass (2026-10-26).

---

## Milestone 6: Backend — New API Endpoints

- [x] **Task 6.1: Route registration order** — `backend/routers/candidates.py`
  - Register the `/resolve` route **before** the `/{candidate_id}` parameterised route so the literal path segment is not swallowed by the parameter matcher.
  - This applies to both the versioned `/api/v1/candidates/resolve` and any unprefixed alias.
  - Completion: Registered resolve before the candidate-ID route; both versioned and unprefixed aliases are verified by HTTP tests.

- [x] **Task 6.2: Candidate context endpoint**
  - `GET /api/v1/candidates/{candidate_id}/context`
  - If the candidate ID is not found, return 404.
  - If the build state is "building," return 202 with a body containing the candidate ID and the status string "building." The frontend must handle 202 by polling or showing a skeleton.
  - If the build state is "failed," return 503 with the error message.
  - If the build state is "ready," return 200 with the full CandidateContext.
  - Add an unprefixed alias.
  - Completion: Implemented context lookup with canonical candidate IDs, 404 for unknown IDs, 202 building plus Retry-After: 3, 503 failed, and full context on 200. Missing registry entries are queued lazily.

- [x] **Task 6.3: Candidate resume endpoint**
  - `GET /api/v1/candidates/{candidate_id}/resume`
  - Return the raw resume text, the parse source label, and the character count.
  - Return 404 if the candidate is not found.
  - Return 204 if the candidate exists but parse source is "empty."
  - Add an unprefixed alias.
  - Completion: Implemented resume payloads for original uploaded parse results or labeled seed fallbacks. Returns an actual bodyless 204 when no text exists and 404 for unknown candidates; both route prefixes work.

- [x] **Task 6.4: Candidate resolve endpoint**
  - `GET /api/v1/candidates/resolve`
  - Accept query parameters for name and email (both optional, at least one required).
  - Match against seeded candidates by exact email or case-insensitive partial name match.
  - Return a list of matching CandidateSummary objects. Return an empty list when no match is found; never return 404.
  - Add an unprefixed alias.
  - Completion: Implemented required nonblank name/email input, trimmed case-insensitive partial-name and exact-email matching across all in-memory candidates (including uploads). When both are supplied they are combined with AND. No matches returns an empty list.

- [x] **Task 6.5: Cache rebuild endpoint** — `backend/routers/admin.py` (new file)
  - `POST /seed/rebuild`
  - When `settings.admin_key` is configured, require a matching `X-Admin-Key` header and return 401 if it is absent or wrong.
  - When `settings.admin_key` is not configured (not set in the environment), the endpoint must return 403 and a message explaining that it is disabled until an admin key is set. It must not be open in prototype mode.
  - On an authorised request, clear the signal disk cache, re-run the seed loader, and schedule background context rebuilds for all candidates. Return the rebuild timestamp, candidate count, and job count.
  - Completion: Implemented POST /seed/rebuild with constant-time X-Admin-Key comparison and backend-only ADMIN_KEY configuration. Unset/empty key returns 403; missing/wrong header returns 401. Authorized rebuilds cancel old workers, clear cache entries, reload seeds, clear uploaded inputs/old registry and schedule new builds. Upload mutations serialize with rebuilds. Cache failure returns 503 without permanently disabling later upload scheduling.

- [x] **Task 6.6: API tests** — `backend/tests/test_context_api.py`
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
  - Completion: Added HTTP contract tests for building/ready/failed, resume/stub/204, aliases, resolution and validation, protection, authorized rebuild/cache clearing, and failure recovery. Repeated ready-context responses also verify deterministic scores. Backend suite: 196 passing tests.

---

## Milestone 7: Frontend — Evidence Components & Evidence Explorer

- [x] **Task 7.1: TypeScript types** — `frontend/src/types/context.ts`
  - Define types for ResumeClaim (with ID, candidate ID, claim text, section, skill tag, provenance, verification state), EvidenceRecord (with ID, candidate ID, skill, source type, source URL, observation, base weight, recency multiplier, computed weight, observation date, provenance), CandidateContext (wrapping CandidateDetail with claim list, record list, score, label, resume text, parse source, reference date, context_built_at), and ResumePayload.
  - Verification state on a claim must be one of three string literals: unverified, supported, or contradicted. The UI must never infer "supported" from the presence of an evidence record; it must read this field explicitly.
  - Completion: Added canonical context/claim/evidence/resume/building TypeScript contracts and shared tier/provenance display helpers. Claim state is always read explicitly.

- [x] **Task 7.2: API service functions** — `frontend/src/services/api.ts`
  - Add a function that fetches a candidate's CandidateContext and returns the response body on 200, a build-in-progress object on 202, and throws on 4xx or 5xx.
  - Add a function that fetches a candidate's resume payload and returns the body on 200 or null on bodyless 204.
  - Add a function that calls the resolve endpoint with name or email parameters and returns the matching summary list.
  - Completion: Added context, resume, resolve and multipart-upload service methods. 202 remains an explicit building union; 204 returns null without JSON parsing. Request tests verify status handling, encoded query parameters and browser-generated multipart content type.

- [x] **Task 7.3: EvidenceBar component** — `frontend/src/components/evidence/EvidenceBar.tsx`
  - Render a segmented horizontal bar with five tiers: gray (No public evidence), yellow (Limited), blue (Some), indigo (Good), emerald (Strong).
  - The active tier and all tiers below it are highlighted; tiers above the active score are muted.
  - Animate fill on mount. Respect the prefers-reduced-motion media query.
  - Use ARIA meter role with the numeric score and label as accessible attributes.
  - Completion: Implemented five-tier EvidenceBar with numeric meter ARIA attributes, continuous-tier rendering and reduced-motion-aware animation. Scores are labeled points, not percentages or role fit.

- [x] **Task 7.4: EvidenceCard component** — `frontend/src/components/evidence/EvidenceCard.tsx`
  - In its collapsed state, show the source type icon, a short observation summary, the computed weight, and the recency label.
  - In its expanded state, show the full observation text, a clickable source URL that opens in a new tab, the observation date or "Undated," the weight formula as plain text (base weight × recency multiplier = computed weight), and the provenance label. LinkedIn records must display the provenance "synthetic — linkedin stub" visibly.
  - Toggle between states on click or keyboard activation.
  - Completion: Implemented keyboard-operable EvidenceCard with source icon/text, weight/date preview, expanded source audit, HTTP(S)-only external links and visible provenance in both states. Synthetic LinkedIn records remain clearly labeled.

- [x] **Task 7.5: ResumeViewer component** — `frontend/src/components/profile/ResumeViewer.tsx`
  - Fetch and display the candidate's raw resume text in a scrollable monospace area.
  - Show the parse source as a visible badge.
  - Provide a copy-to-clipboard button.
  - Wire to the existing Resume Reference action button in CandidateProfileShell, which now opens the viewer.
  - Completion: Implemented ResumeViewer with source badge, synthetic-stub notice, copy feedback/fallback, loading/error/retry and empty-text states. Resume Reference now opens it.

- [x] **Task 7.6: Upgrade Evidence & Claims tab** — `frontend/src/components/profile/CandidateProfileShell.tsx`
  - Fetch the candidate context on tab open.
  - While the build state is "building" (202 response), show a loading skeleton and a status message. Poll at a reasonable interval (every 3 seconds, maximum 10 attempts) then fall back to a manual retry button.
  - On a "failed" (503) or network error, show an error state with a retry button.
  - On success, render the EvidenceBar and the list of EvidenceCards.
  - Render each ResumeClaim with its text, section tag, and verification state badge. The verification state badge must come from the claim's own verification_state field; never infer it from co-located evidence records.
  - Context/provenance summaries distinguish pending, no evidence, live/cache observations, synthetic-only fixtures and mixed inputs. The claim verification state badge remains separate; synthetic data never implies live verification.
  - Completion: Profile consumes context with 3-second polling, at most ten attempts per cycle, cancellation on navigation, error/manual retry states and parsed claims with explicit verification badges. Source observations and provenance are separate from claim states; synthetic-only or mixed records never receive a misleading live-only label.

- [x] **Task 7.7: Upgrade Reported Skills tab**
  - Group evidence records by their skill field. For each skill, show the aggregated computed weight and the count of supporting records.
  - Retain the existing top_skills chip list. Add a sub-row per skill showing the evidence tier derived from its aggregated weight.
  - Completion: Reported Skills retains original skill chips and groups observations by case-insensitive skill, showing counts, aggregate weights and evidence tiers without claiming proficiency verification.

- [x] **Task 7.8: Update CandidateCard evidence display**
  - The current cards show "Unassessed" for all candidates. That is the correct baseline.
  - After context is ready for a candidate, lazily replace "Unassessed" with the real evidence label.
  - Render a compact EvidenceBar below the skill chips when context is ready.
  - While context is still building, retain "Unassessed" without a spinner or badge change. Do not show a seeded evidence label from the seed JSON as if it were a computed result.
  - Completion: Candidate cards keep Unassessed while building/unavailable, then show the context evidence label and compact meter. They keep Role fit pending and never substitute seeded fit scores. Provenance summaries distinguish synthetic records.

- [x] **Task 7.9: Evidence Explorer view** — `frontend/src/components/evidence/EvidenceExplorer.tsx`
  - Activate the sidebar Evidence Explorer link, which is currently a Phase 2 placeholder.
  - List all candidates with their EvidenceBar, numeric score, label, and count of evidence records by source type.
  - Clicking a candidate navigates to their profile with the Evidence & Claims tab pre-selected.
  - Provide a filter bar: filter by evidence label tier, by source type (GitHub, LeetCode, LinkedIn), and by minimum score.
  - Show loading, error, and empty states with appropriate retry controls.
  - Completion: Activated Evidence Explorer with all candidate contexts, source counts, tier/source/minimum-score filters, reset, refresh, error/empty/building states and bounded polling. Inspect opens the correct profile on Evidence & Claims.

- [x] **Task 7.10: Frontend interaction tests** — `frontend/src/test/`
  - EvidenceBar: verify meter role and aria attributes; verify correct tier highlighting at each PRD boundary score; verify animation class is absent when reduced-motion is set.
  - EvidenceCard: verify collapsed and expanded state render; verify source URL link is present in expanded state; verify LinkedIn records show the synthetic provenance label; verify keyboard activation toggles state.
  - ResumeViewer: verify text and source badge render with a mocked API response; verify copy button is present.
  - Evidence & Claims tab: verify loading skeleton while API returns 202; verify error state on 503; verify claim verification state badge reads from the claim field, not from evidence record presence.
  - EvidenceExplorer: verify tier filter reduces the displayed list; verify row click triggers navigation with the correct candidate ID.
  - Extend the existing 5 Vitest tests to 12 or more passing.
  - Completion: Frontend suite has 27 passing tests, covering tier boundaries, reduced motion, keyboard audits, resume copy/204, explicit claim states, bounded polling/ready transition, card state, Explorer filters/navigation/retry and API request contracts. Added a functional candidate resume upload form with correction fields and browser round-trip coverage.

---

## Milestone 8: Verification & Sign-off

- [x] **Task 8.1: End-to-end acceptance**
  - [x] Server starts, accepts requests immediately, and completes background context builds for all 6 seeded candidates without crashing.
  - [x] Context endpoint returns 202 while building and 200 after build completes.
  - [x] Evidence & Claims tab shows a skeleton during building state, then switches to real records on ready.
  - [x] Each EvidenceCard for a LinkedIn record shows the "synthetic — linkedin stub" provenance label.
  - [x] Resume Reference button opens the ResumeViewer with non-empty text and the correct source badge.
  - [x] Evidence Explorer sidebar link opens the new view; tier and source-type filters work correctly.
  - [x] Candidate cards show "Unassessed" on initial load, then update to the real label once context is ready.
  - [x] Simulating a fetcher failure (HTTP 500 from the mock) does not prevent the context build from completing with the other fetchers' data.
  - [x] Rebuild endpoint returns 403 with no admin key configured.
  - Completion: Acceptance uses real local Vite/FastAPI APIs with controlled adapter inputs in backend.tests.browser_app, not live external services. Six startup contexts, building/error/ready states, source audits, resume views, Explorer filters, card upgrades, upload round-trips and rebuild protection are exercised. A real fetcher with a mocked HTTP 500 is tested through context building.

- [x] **Task 8.2: Determinism regression test**
  - Run the scoring function three times on the same controlled fixture input with the same reference date.
  - Assert that the raw score and the label are identical across all three runs.
  - This test must use fixture data only; live fetcher output must not be the input.
  - Completion: All six controlled score fixtures reproduce across three runs at fixed reference dates. API tests repeat ready-context retrieval and compare score/label; no live data is used.

- [x] **Task 8.3: Accessibility & responsive review**
  - EvidenceBar meter role and aria-label pass axe WCAG A/AA scan.
  - EvidenceCard keyboard toggle and focus-visible pass axe scan.
  - Evidence Explorer filter bar is usable at 390px mobile width without horizontal overflow.
  - Playwright smoke test: open Evidence Explorer, apply "Strong" tier filter, assert list count decreases.
  - Completion: Desktop and 390px-mobile browser scenarios include Axe WCAG A/AA scans for Explorer and expanded Evidence & Claims, keyboard source toggles, profile/resume navigation, tier filters and horizontal-overflow assertions. Screenshots support visual inspection.

- [x] **Task 8.4: Update documentation**
  - Update `README.md` with Phase 2 setup: GITHUB_TOKEN environment variable (optional), signal cache path, LinkedIn stub fixture file format, and the admin key requirement for the rebuild endpoint.
  - Add `backend/data/linkedin_stubs/README.md` describing the stub file schema and the synthetic provenance requirement.
  - Update `backend/data/fixtures/README.md` describing the controlled fixture format and confirming that test suites use fixtures, not live data.
  - Mark this file Status: Complete and record final test counts.
  - Completion: README, environment template, fixture documentation and roadmap updated with setup, admin controls, HTTP contracts, offline test server, provenance boundaries and final verification evidence.

---

## Follow-on Phase 3 Dependencies Exposed by Phase 2

| Phase 3 Task | What Phase 2 Provides |
|:---|:---|
| JD requirement extraction | ResumeClaim list (with skill tags and section) as structured input for requirement-vs-claim matching |
| Dual-axis ranking formula | Deterministic evidence_score as the evidence strength axis input |
| Requirement coverage display | EvidenceRecord.source_url as the per-requirement audit trail link |
| Card match preview | Phase 2 already replaces Unassessed with computed evidence labels. Role-fit scores remain pending until Phase 3 |

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

## Final Review Evidence (2026-10-26)

- Backend: **196 pytest tests pass**. Includes API aliases/statuses, protected rebuild and cache-error recovery, mocked HTTP-500 context integration, revision races, startup/shutdown, fixtures, parsers and deterministic scoring.
- Frontend: **27 Vitest tests pass**. Includes continuous tiers/ARIA, reduced motion, source keyboard toggles, resume copy/204, explicit claim state, polling limits/ready transitions, Explorer filtering/navigation and API contracts.
- Browser: **18 Playwright checks pass** across desktop Edge and 390px mobile widths (9 scenarios per viewport). Dedicated offline backend runs the actual FastAPI routes and context builder with controlled adapters and a fixed clock. No GitHub/LeetCode calls are made by automated tests.
- Build: TypeScript and Vite production build pass; oxlint passes without warnings.
- Determinism: three-run assertions for all six controlled score fixtures plus repeated ready-context HTTP responses pass.
- Accessibility: Axe WCAG A/AA scans pass on Explorer and expanded Evidence & Claims, as well as the existing workspace checks. Keyboard, reduced-motion and horizontal-overflow assertions pass. This is automated acceptance for the checked flows, not a universal accessibility certification.
- Visual review: inspected desktop evidence profile and mobile Explorer screenshots; synthetic provenance is visible. Final screenshots/traces are in ignored `frontend/test-results/`.
- Scope: all numbered Phase 2 tasks are complete. Live external service availability is not established by offline tests. LinkedIn remains explicitly synthetic; candidate storage is process-local; role-fit/ranking, AI briefs/chat, graph integration and production persistence/auth remain later phases.


## Phase 3 follow-through (2026-10-28)

The CandidateCard match preview (Unassessed to a real role-fit score) is completed
in Phase 3 Tasks 6.5 and 6.9. Evidence readiness alone does not change role fit.
Cards show the final percentage only after ranking for the active job; changing
the active job or leaving ranked mode restores Unassessed. See
[PHASE_3_TASKS.md](PHASE_3_TASKS.md) for matching, filtering and JD Match sign-off.
