# Phase 3: JD Matching, Requirement Extraction & Candidate Ranking — Task List

**Created:** 2026-10-26
**Status:** Complete - Tasks 1.1 through 7.5 implemented and verified on 2026-10-28. Final totals: 253 backend tests, 37 frontend tests, 26 browser checks.
**Objective:** Deconstruct job descriptions into discrete typed requirements, match each requirement against candidate resume claims and external evidence assembled in Phase 2, compute a fully deterministic dual-axis ranking score, and surface per-requirement coverage breakdowns and ranked candidate lists through new backend endpoints and frontend views.

Phase 2 Tasks 1.1-8.4 are complete. Phase 3 consumes the existing CandidateContext registry, claims, evidence records and context APIs. See [PRD.md](PRD.md) for functional requirements and [PHASE_2_TASKS.md](PHASE_2_TASKS.md) for the Phase 2 contracts.

> **Design constraints carried into Phase 3:**
> - Determinism: identical JD text and identical CandidateContext inputs must always produce identical scores in the same order. No hidden state or clock dependency.
> - No LLM scoring: LLMs may generate explanatory narrative in Phase 4, but all numeric scores in Phase 3 are pure deterministic functions.
> - No implicit verification: a matched requirement does not change a claim's `verification_state`. That field is the responsibility of explicit evidence review only.
> - Fail-soft: a building or failed CandidateContext for one candidate must not abort ranking for all others.
> - Skill aliases are resolved through a configurable taxonomy file. Raw string equality is never the sole match criterion.
> - Seeded jobs already carry structured `JobRequirement` objects in their JSON files. The extractor must not re-extract from raw text when a structured list is present.

---

## Milestone 1: Backend — Requirement Models & Skill Taxonomy

- [x] **Task 1.1: Define matching models** — `backend/models/matching.py`
  - Define `ExtractedRequirement` carrying a stable unique ID, the raw requirement text, a normalized form (lowercased, punctuation stripped), a category (Backend / Frontend / Cloud / Database / API / Leadership / Domain / Other), an is_mandatory flag, and a list of resolved canonical skill names the requirement covers.
  - Define `CoverageState` as a string enum with four values: matched, partially_supported, insufficient_evidence, not_assessed.
  - Define `RequirementCoverage` carrying the requirement ID, a CoverageState, the IDs of matching ResumeClaims, the IDs of matching EvidenceRecords, a computed coverage weight (float, 0.0–1.0), and an observation string (template-generated, not LLM).
  - Define `CandidateMatchResult` carrying a candidate ID, a job ID, a reference date, a resume fit score (float 0.0–1.0), an evidence strength score (float 0.0–1.0), a final score (float 0.0–1.0), a list of RequirementCoverage entries, and a `result_built_at` UTC timestamp.
  - Define `RankedCandidate` carrying candidate ID, full name, headline, the three score components, the overall EvidenceLabel from Phase 2, and coverage state counts (matched, partially_supported, insufficient_evidence, not_assessed).
  - Define `SimilarJob` carrying job ID, title, shared requirement count, the list of overlapping requirement texts, and an overlap ratio (shared / total unique requirements).
  - Export all new models from `backend/models/__init__.py`.

- [x] **Task 1.2: Skill taxonomy file** — `backend/data/taxonomy/skill_aliases.json`
  - Create a JSON mapping of canonical skill name → list of accepted aliases.
  - Cover at minimum: Python, Go, JavaScript, TypeScript, React, FastAPI, Kubernetes, Docker, Apache Kafka, PostgreSQL, SQL, AWS, Terraform, Distributed Systems, Machine Learning, Neo4j, Redis, gRPC, REST.
  - Aliases handle common variations: `React.js`, `ReactJS`, `k8s`, `Postgres`, `Kafka`, `ML`, `REST API`.
  - This file is the single source of truth; no alias logic is hard-coded in service files.
  - Add `backend/data/taxonomy/README.md` explaining the format and how to extend it.

- [x] **Task 1.3: Taxonomy loader service** — `backend/services/taxonomy.py`
  - Load `skill_aliases.json` once at module import into an in-memory dict mapping alias → canonical name.
  - Expose `resolve_skill(text: str) -> str | None`: case-insensitive match through aliases; return canonical name or None.
  - Expose `skills_for_requirement(requirement_text: str) -> list[str]`: run `resolve_skill` across tokens and bigrams in the text; return deduplicated canonical skill names.
  - Pure functions after initial load. Never mutate the in-memory dict post-startup.

- [x] **Task 1.4: Taxonomy unit tests** — `backend/tests/test_taxonomy.py`
  - Verify `resolve_skill` returns the canonical name for an exact alias, a case-variant, and a dot-notation alias.
  - Verify `resolve_skill` returns None for text matching no alias.
  - Verify `skills_for_requirement` returns all canonical names when the text contains multiple aliased skills.
  - Verify the taxonomy dict is not mutated between calls (test three times, assert identical results).
  - All tests run without I/O beyond the initial module import.

---

## Milestone 2: Backend — JD Requirement Extractor

- [x] **Task 2.1: Requirement extractor service** — `backend/services/requirement_extractor.py`
  - `extract_requirements(jd_text: str, job_id: str) -> list[ExtractedRequirement]`
  - Rule-based only; no LLM.
  - Split JD text into sentences and bullet lines. Classify each unit as a requirement candidate.
  - Mandatory markers: must, required, essential, minimum, at least, proven, demonstrated.
  - Preferred markers: preferred, nice to have, plus, bonus, ideally, familiarity with.
  - Lines with neither marker default to mandatory.
  - Assign category using the taxonomy: the most common category among resolved skills for that line; fall back to Other.
  - Produce a normalized form: lowercased, punctuation stripped, whitespace collapsed.
  - Deduplicate by normalized form before returning.
  - Return 5–10 requirements. Fewer than 5 is valid (return what is found). If more than 10 pass, keep the first 5 mandatory then fill remaining slots with preferred ones up to 10.
  - IDs use the form `{job_id}-REQ-{n:03d}` where n is the ordinal position in the returned list.

- [x] **Task 2.2: Seeded job structured requirements bypass**
  - For the five existing seed jobs (JOB-001 through JOB-005), structured `JobRequirement` objects already exist in their JSON files with typed IDs, categories, and is_mandatory flags.
  - When a `job_id` maps to a seeded job, the `POST /jd/extract` endpoint returns those structured requirements directly, converted to `ExtractedRequirement` shape. The text extractor is not invoked.
  - When `jd_text` is supplied without a matching seeded job_id (custom JD), the text extractor runs.
  - Document this bypass clearly in both the extractor module and the endpoint so future contributors do not accidentally re-extract seeded requirements.

- [x] **Task 2.3: Extractor unit tests** — `backend/tests/test_requirement_extractor.py`
  - Extract from a synthetic JD containing 3 mandatory and 4 preferred bullets; verify category, is_mandatory, skill_aliases, normalized text, and ID format for each.
  - Verify mandatory lines with "must" and preferred lines with "preferred" are classified correctly.
  - Verify the 10-requirement cap: input 12 valid lines, assert 10 returned, mandatory requirements fill first.
  - Verify a 3-line JD returns 3 requirements without padding.
  - Verify duplicate normalized lines collapse to one requirement.
  - All tests use synthetic JD strings; no file I/O.

---

## Milestone 3: Backend — Requirement Matcher & Coverage Classifier

- [x] **Task 3.1: Claim-to-requirement matcher** — `backend/services/requirement_matcher.py`
  - `match_claims_to_requirement(requirement: ExtractedRequirement, claims: list[ResumeClaim]) -> tuple[list[str], float]`
  - For each claim, check whether any of the requirement's skill aliases appears in the claim text or the claim's skill tag (via `resolve_skill`).
  - A claim with verification_state "unverified" or "supported" contributes to the match. A contradicted claim does not.
  - Return matching claim IDs and a claim match ratio (matched / total non-contradicted claims, capped at 1.0). Zero claims → ratio 0.0.

- [x] **Task 3.2: Evidence-to-requirement matcher**
  - `match_evidence_to_requirement(requirement: ExtractedRequirement, records: list[EvidenceRecord]) -> tuple[list[str], float]`
  - For each record, check whether `resolve_skill(record.skill)` maps to any alias in the requirement's skill list.
  - Compute normalized evidence strength for this requirement: sum of `computed_weight` for matching records, divided by 9.0 (the Strong tier upper bound), capped at 1.0.
  - Records with `source_type="interview_feedback"` and `base_weight=0` (negative feedback) contribute 0 even when the skill matches.
  - Return matching record IDs and the normalized evidence strength float.

- [x] **Task 3.3: Coverage classifier**
  - `classify_coverage(claim_ratio: float, evidence_strength: float) -> CoverageState`
  - Apply strictly defined, non-overlapping thresholds (declared as named constants):
    - matched: claim_ratio >= 0.5 AND evidence_strength >= 0.3
    - partially_supported: claim_ratio >= 0.25 OR evidence_strength >= 0.15 (but not satisfying both matched thresholds)
    - insufficient_evidence: claim_ratio > 0 OR evidence_strength > 0 (but below partially_supported thresholds)
    - not_assessed: claim_ratio == 0.0 AND evidence_strength == 0.0
  - Pure function with no I/O or state. Threshold constants are declared once and imported by both the classifier and its tests.

- [x] **Task 3.4: Template-based observation generator**
  - `generate_observation(requirement: ExtractedRequirement, coverage_state: CoverageState, claim_count: int, evidence_count: int) -> str`
  - Return a plain-English sentence assembled from the coverage state, requirement category, claim count, and evidence count using string templates. No LLM.
  - Each of the four states has a distinct template. The generated text is stored in `RequirementCoverage.observation`; it is never used as a score input.

- [x] **Task 3.5: Matcher and classifier unit tests** — `backend/tests/test_requirement_matcher.py`
  - Claim matcher: verify a matching claim is returned when alias appears in claim text; verify no match when skill is absent; verify contradicted claims are excluded.
  - Evidence matcher: verify matching record returned when skill resolves to requirement alias; verify zero-weight negative feedback contributes 0 to strength even when skill matches.
  - Coverage classifier: parametrize all four states with at least two boundary pairs per transition; verify both sides of each boundary.
  - Observation generator: verify each state produces a non-empty string referencing the requirement's skill.
  - All tests use synthetic data only.

---

## Milestone 4: Backend — Ranking Engine

- [x] **Task 4.1: Resume fit score function**
  - `compute_resume_fit(coverage_list: list[RequirementCoverage], requirements: list[ExtractedRequirement]) -> float`
  - Resume Fit = sum of (coverage_weight × requirement_weight) / sum of requirement_weights.
  - Mandatory requirements use weight 1.0; preferred use 0.5.
  - Coverage weights: matched → 1.0, partially_supported → 0.5, insufficient_evidence → 0.1, not_assessed → 0.0.
  - Returns float in [0.0, 1.0]. Pure function with no I/O.

- [x] **Task 4.2: Evidence strength score function**
  - `compute_evidence_strength(coverage_list: list[RequirementCoverage], requirements: list[ExtractedRequirement]) -> float`
  - Weighted average of per-requirement `evidence_strength` values, using the same mandatory/preferred weights as Task 4.1.
  - Returns float in [0.0, 1.0]. Pure function.

- [x] **Task 4.3: Final dual-axis score function**
  - `compute_final_score(resume_fit: float, evidence_strength: float) -> float`
  - Final Score = 0.5 × Resume Fit + 0.5 × Evidence Strength.
  - Raise ValueError if either input is outside [0.0, 1.0].
  - Returns float in [0.0, 1.0]. Pure function.

- [x] **Task 4.4: Candidate ranker function**
  - `rank_candidates(job: Job, contexts: dict[str, CandidateContext], reference_date: date) -> list[RankedCandidate]`
  - For each candidate, run the full pipeline: use structured requirements for seeded jobs / extract for custom → match claims → match evidence → classify coverage → compute the three scores → build `CandidateMatchResult`.
  - Candidates with a building or failed context are included with all scores 0.0 and all coverage states not_assessed; sorted to the bottom.
  - Sort output by final_score descending, then evidence_strength descending, then resume_fit descending, then candidate_id lexicographically. This makes the sort fully deterministic with no ties left unresolved.
  - A scoring failure for one candidate must not abort the rest; log and use 0.0 scores.
  - `reference_date` is passed explicitly; the function never reads the clock.

- [x] **Task 4.5: Similar job finder function**
  - `find_similar_jobs(source_job: Job, all_jobs: list[Job]) -> list[SimilarJob]`
  - For each other job, compute overlap as the count of normalized requirement texts present in both jobs.
  - Sort by overlap_count descending, then by job_id lexicographically for determinism.
  - Exclude the source job. Return at most 5 results.
  - Pure function.

- [x] **Task 4.6: Ranking unit tests** — `backend/tests/test_ranking_engine.py`
  - Resume fit: verify mandatory requirements receive double the influence of preferred; verify all not_assessed → 0.0; verify all matched mandatory → 1.0.
  - Evidence strength: verify mandatory/preferred weighting mirrors resume fit.
  - Final score: verify the 0.5/0.5 formula at known inputs; verify ValueError on inputs outside [0.0, 1.0].
  - Ranker: use controlled fixture contexts; verify sort order at equal final scores resolves by evidence then resume_fit then candidate_id; verify building-context candidate appears at the bottom with 0.0; verify one scoring failure does not abort others.
  - Similar jobs: verify overlap count; verify source job is excluded; verify 5-result cap; verify deterministic order.
  - Three-run determinism assertion on `rank_candidates` with the same inputs.
  - All tests use fixed reference dates and synthetic data only.

---

## Milestone 5: Backend — Match Store & New API Endpoints

- [x] **Task 5.1: Match result store** — `backend/services/match_store.py`
  - Maintain an in-memory dict mapping `(job_id, candidate_id, reference_date)` → `CandidateMatchResult`.
  - Expose `store_result`, `get_result`, `get_ranked_list(job_id, reference_date)`, and `clear_job(job_id)`.
  - Thread-safe via a lock, consistent with the `ContextBuildRegistry` pattern from Phase 2.
  - A result keyed to a different `reference_date` is stale and must not be returned.

- [x] **Task 5.2: JD router** — `backend/routers/jd.py` (new file)
  - Register this router in `backend/main.py` under `/api/v1/jd` with an unprefixed alias `/jd`. Verify no conflicts with candidate routes.

- [x] **Task 5.3: JD extract endpoint** — `POST /api/v1/jd/extract`
  - Accept JSON body with `job_id` (optional) or `jd_text` (optional). At least one is required; if both present, `job_id` takes precedence.
  - Return a list of `ExtractedRequirement` objects.
  - Return 404 when `job_id` is provided but not found.
  - Return 422 when neither field is present or `jd_text` is shorter than 50 characters.
  - Add unprefixed alias.

- [x] **Task 5.4: JD rank endpoint** — `POST /api/v1/jd/rank`
  - Accept JSON body with `job_id` (required) and optional `reference_date` (ISO 8601 date string; defaults to the UTC date of the request if omitted).
  - Collect ready `CandidateContext` objects from `ContextBuildRegistry` for all known candidates. Building candidates included with 0.0 scores.
  - Run `rank_candidates`, store results in the match store, and return the ordered `RankedCandidate` list.
  - Return 404 when `job_id` is not found.
  - Add unprefixed alias.

- [x] **Task 5.5: Candidate JD match endpoint** — `POST /api/v1/candidates/{candidate_id}/jd-match`
  - Accept JSON body with `job_id` (required) and optional `reference_date`.
  - Return the `CandidateMatchResult` for this candidate against the given job.
  - If a stored result exists for this `(job_id, candidate_id, reference_date)` tuple, return it.
  - Otherwise run the pipeline for this single candidate, store, and return.
  - Return 404 when candidate or job is not found.
  - Return 503 when the candidate context build has failed.
  - Return 202 with a status body when the candidate context is still building.
  - Add unprefixed alias.

- [x] **Task 5.6: Similar jobs endpoint** — `POST /api/v1/jd/similar`
  - Accept JSON body with `job_id` (required).
  - Return up to 5 `SimilarJob` objects.
  - Return 404 when `job_id` is not found.
  - Add unprefixed alias.

- [x] **Task 5.7: API tests** — `backend/tests/test_matching_api.py`
  - Extract endpoint returns structured requirements for a known seeded job_id.
  - Extract endpoint returns extracted requirements for a jd_text input.
  - Extract endpoint returns 422 with neither field; 404 for unknown job_id; 422 for jd_text under 50 characters.
  - Rank endpoint returns a list with one entry per known candidate, sorted by final score descending.
  - Rank endpoint called twice with same inputs returns identical results in identical order.
  - Candidate jd-match endpoint returns CandidateMatchResult for CAND-001 with JOB-001.
  - Candidate jd-match endpoint returns 404 for unknown candidate; 404 for unknown job.
  - Similar endpoint returns at most 4 results for JOB-001 (5 total jobs minus source).
  - All tests use controlled fixture contexts and mock ContextBuildRegistry; no live network calls.
  - Extend the test suite; total target is 230 or more passing tests.

---

## Milestone 6: Frontend — Types, API Client & Matching Views

- [x] **Task 6.1: TypeScript types** — `frontend/src/types/matching.ts`
  - Define `ExtractedRequirement`, `CoverageState`, `RequirementCoverage`, `CandidateMatchResult`, `RankedCandidate`, and `SimilarJob` matching the backend models exactly.
  - `CoverageState` must be a string union of the four literal values; no numeric enum.

- [x] **Task 6.2: API service functions** — `frontend/src/services/api.ts`
  - `extractRequirements(params: {job_id?: string; jd_text?: string}): Promise<ExtractedRequirement[]>`
  - `rankCandidates(params: {job_id: string; reference_date?: string}): Promise<RankedCandidate[]>`
  - `getCandidateJdMatch(candidate_id: string, params: {job_id: string; reference_date?: string}): Promise<CandidateMatchResult | {status: 'building'} | {status: 'failed', error: string}>` — handle 202 and 503 distinctly; do not throw on either.
  - `getSimilarJobs(job_id: string): Promise<SimilarJob[]>`

- [x] **Task 6.3: Replace custom JD requirement preview** — `frontend/src/components/dashboard/CustomJDModal.tsx`
  - After submission, call `extractRequirements({jd_text})` and display the returned list as requirement chips, with mandatory and preferred chips visually distinct.
  - If the call fails (network error, text too short), fall back to the existing newline-split preview with a muted note "Requirements not extracted."
  - Do not change the modal's title, description, location, or validation logic.
  - The active custom job in JobContext must retain the extracted requirement list alongside the existing fields.

- [x] **Task 6.4: Active job requirements in Overview** — `frontend/src/components/dashboard/DashboardOverview.tsx`
  - When a seeded job is active, render its structured requirements as typed chips; mandatory and preferred chips use distinct visual styles.
  - When a custom job is active, render the extracted requirement chips retained from the modal (Task 6.3). If none were extracted, show the existing newline preview.
  - Do not show a score or percentage here; this is an input display only.

- [x] **Task 6.5: Ranked candidate pool** — `frontend/src/components/dashboard/CandidateGrid.tsx`
  - When an active job is selected, show a "Rank by fit" button alongside the skill filter bar.
  - On click, call `rankCandidates({job_id})`, switch to ranked mode, sort cards by final score descending, and show a compact score badge (Resume Fit / Evidence / Final) on each card.
  - Candidates with a building context are sorted last and show a "Context building" chip instead of scores.
  - While the rank request is in flight, show the existing 6 loading skeletons.
  - A "Back to default order" button exits ranked mode and restores the original API-ordered list.
  - When no job is active, "Rank by fit" is not shown.

- [x] **Task 6.6: Requirement filter bar** — `frontend/src/components/dashboard/RequirementFilter.tsx`
  - When ranked mode is active, render a row of requirement chips above the grid.
  - Clicking a chip filters the ranked list to candidates with matched or partially_supported coverage for that requirement.
  - Multiple active chips are intersected: a candidate must satisfy all active filters to be shown.
  - A "Clear filters" button removes all active chips.
  - Not shown when no job is active or ranking has not been triggered.

- [x] **Task 6.7: JD Match tab** — `frontend/src/components/profile/JDMatchTab.tsx`
  - Add a fourth profile tab "JD Match," visible only when a job is active.
  - On tab open, call `getCandidateJdMatch(candidate_id, {job_id})`.
  - While building (202): show a skeleton with "Candidate context is still building. Match will be available once ready." Poll every 3 seconds, max 10 attempts, then fall back to a manual retry button.
  - On failed (503): show an error state with a retry button.
  - On success, render:
    - A headline score row showing Resume Fit, Evidence Strength, and Final Score as labeled percentages.
    - One coverage card per requirement, showing: requirement text, mandatory/preferred badge, coverage state chip (matched=green, partially_supported=amber, insufficient_evidence=orange, not_assessed=gray), and the observation string.
    - Expanding a coverage card reveals the supporting claim texts and evidence observations inline, sourced from the already-loaded `CandidateContext`.
  - Wire the new tab into `CandidateProfileShell.tsx` alongside the existing three tabs.

- [x] **Task 6.8: Similar jobs panel** — `frontend/src/components/dashboard/JobsView.tsx`
  - When a job is selected in the Jobs view, call `getSimilarJobs(job_id)` and render a "Similar Requisitions" section below the active job card.
  - Each entry shows title, overlap count, and overlapping requirement chips.
  - Clicking a similar job sets it as the active job.
  - Empty list: show a muted "No similar requisitions found." Loading and error states follow existing panel patterns.

- [x] **Task 6.9: CandidateCard match display** — `frontend/src/components/cards/CandidateCard.tsx`
  - In ranked mode (scores passed as props from CandidateGrid): display the final score as a percentage badge replacing "Unassessed."
  - In non-ranked mode: retain "Unassessed." Never use a Phase 2 evidence label as a proxy for a fit score.
  - The card must never show a fit score when no ranking has been triggered for the active job.

- [x] **Task 6.10: Frontend interaction tests** — `frontend/src/test/`
  - CustomJDModal: mock `extractRequirements`; verify mandatory/preferred chip distinction renders; verify newline fallback on API failure.
  - CandidateGrid: mock `rankCandidates`; verify ranked mode renders score badges; verify building candidate sorts last with chip; verify "Back to default order" restores original list.
  - RequirementFilter: verify chip click reduces visible candidate count; verify multi-chip intersection; verify "Clear filters" removes all.
  - JDMatchTab: verify skeleton on 202; verify error state on 503; verify coverage cards render with correct state colors; verify expanding a card shows claim texts.
  - CandidateCard: verify "Unassessed" without ranking; verify final score badge in ranked mode.
  - Extend the Vitest suite; total target is 22 or more passing tests.

---

## Milestone 7: Verification & Sign-off

- [x] **Task 7.1: End-to-end acceptance**
  - [x] `POST /api/v1/jd/extract` with JOB-001 returns the 5 structured seed requirements without re-extracting from description text.
  - [x] `POST /api/v1/jd/extract` with a custom JD text of 200+ characters returns 5–10 extracted requirements.
  - [x] `POST /api/v1/jd/rank` returns all 6 candidates in descending final score order; building candidates appear last.
  - [x] `POST /api/v1/jd/rank` called 3 times with the same job_id and reference_date returns identical results in identical order.
  - [x] `POST /api/v1/candidates/CAND-001/jd-match` returns a full `CandidateMatchResult` with one `RequirementCoverage` per requirement.
  - [x] `POST /api/v1/jd/similar` for JOB-001 returns at most 4 entries (5 total jobs minus source), sorted by overlap.
  - [x] JD Match tab opens, loads scores, and shows a coverage card per requirement with the correct state color.
  - [x] "Rank by fit" triggers ranking; score badges appear on candidate cards.
  - [x] Requirement filter chips reduce the visible candidate list correctly and intersection is applied across multiple active chips.
  - [x] A mandatory requirement with zero matching claims and zero evidence shows as not_assessed, not insufficient_evidence.
  - [x] CandidateCard shows "Unassessed" in non-ranked mode and the final score badge in ranked mode.

- [x] **Task 7.2: Determinism regression test**
  - Run `rank_candidates` three times with the same six controlled fixture contexts and the same reference date.
  - Assert the full `RankedCandidate` list is byte-identical across all three runs including order.
  - Run once more with the context dict entries supplied in reversed order; assert the output is unchanged.
  - This test uses only controlled fixture data; no live fetchers.

- [x] **Task 7.3: Coverage threshold boundary test**
  - Parametrize `classify_coverage` with explicit (claim_ratio, evidence_strength) pairs covering both sides of every threshold boundary.
  - Include at least one case where claim_ratio satisfies the matched threshold but evidence_strength does not — must be partially_supported.
  - Include one case where both ratios are exactly 0.0 — must be not_assessed.

- [x] **Task 7.4: Accessibility & responsive review**
  - JD Match tab coverage cards: axe WCAG A/AA scan.
  - Requirement filter chips: keyboard navigation and focus-visible pass axe.
  - Ranked candidate grid with score badges: no overflow at 390px mobile width.
  - Playwright smoke test: trigger ranking for an active seeded job; assert at least one score badge is visible on a candidate card.

- [x] **Task 7.5: Update documentation**
  - Update `README.md`: note that `POST /jd/rank` accepts an optional `reference_date` and that omitting it uses the UTC request date.
  - Reference `backend/data/taxonomy/README.md` from the README for skill alias extension instructions.
  - Add a note in `PHASE_2_TASKS.md` clarifying that the CandidateCard match preview ("Unassessed → real score") is completed in Phase 3.
  - Mark this file Status: Complete and record final test counts.

---

## Follow-on Phase 4 Dependencies Exposed by Phase 3

| Phase 4 Task | What Phase 3 Provides |
|:---|:---|
| Candidate assistant (chat) | `CandidateMatchResult` per-requirement observations as grounded LLM context |
| Interview question generator | Coverage states (not_assessed, insufficient_evidence) identify gaps to target with questions |
| Executive brief generator | Resume fit, evidence strength, and final score as the quantitative summary inputs |
| Knowledge graph exploration | `RequirementCoverage.claim_ids` and `evidence_record_ids` as edges linking requirement nodes to candidate nodes |

---

## Ranking Formula Reference (PRD §Phase 3)

**Final Score = 0.5 × Resume Fit + 0.5 × Evidence Strength**

Resume Fit and Evidence Strength are both weighted averages over extracted requirements, with mandatory requirements at weight 1.0 and preferred at 0.5.

| Coverage State | Coverage Weight |
|:---|:---:|
| matched | 1.0 |
| partially_supported | 0.5 |
| insufficient_evidence | 0.1 |
| not_assessed | 0.0 |

Coverage classification thresholds (named constants; no magic numbers in code):

| Condition | State |
|:---|:---|
| claim_ratio ≥ 0.5 AND evidence_strength ≥ 0.3 | matched |
| claim_ratio ≥ 0.25 OR evidence_strength ≥ 0.15 (but not both matched thresholds) | partially_supported |
| claim_ratio > 0 OR evidence_strength > 0 (but below partially_supported thresholds) | insufficient_evidence |
| claim_ratio == 0.0 AND evidence_strength == 0.0 | not_assessed |

Boundary note: a value at exactly the matched threshold for one axis but below it on the other axis is partially_supported. Both thresholds must be satisfied simultaneously to reach matched.

Normalized evidence strength per requirement = sum of `computed_weight` for matching records ÷ 9.0, capped at 1.0. (9.0 is the Strong tier upper bound from Phase 2.)

---

## Review Evidence (2026-10-28)

- Backend: **253 pytest tests pass**, exceeding the target of 230. The final matching/ranking subset also passes after adding reversed-order checks on the six controlled fixture contexts.
- Frontend: **37 Vitest tests pass**, exceeding the target of 22. Coverage includes custom extraction/fallback, ranking and reset, building indicators, intersected requirement filters, all coverage colors, support expansion, bounded polling/retry and distinct 202/503 API handling.
- Browser: **26 Playwright checks pass** across desktop Edge and 390px mobile, including **8 new checks (4 Phase 3 scenarios at each viewport)**. The full suite runs against the offline controlled-adapter app and actual FastAPI routes. Existing job-list assertions now target the main grid independently of Similar Requisitions.
- Determinism: three identical serialized ranking responses for the same job/date; three-run pure ranking byte equality and reversed input order; reversed ordering of all six controlled fixture contexts preserves the complete result list.
- Coverage: named threshold constants and explicit boundary pairs cover both sides of every transition, including one matched axis without the other and exactly zero on both axes.
- Accessibility: zero Axe WCAG A/AA violations on ranked grids/requirement filters and JD Match cards at both viewports. Keyboard activation, visible focus, supporting-detail expansion and no horizontal overflow at 390px pass.
- Visual review: inspected mobile ranked-grid and desktop JD Match screenshots. Final screenshots/traces are in ignored `frontend/test-results/`.
- Build: TypeScript/Vite production build and oxlint pass. `git diff --check` passes.
- Tests are offline and synthetic; live external signal availability is not part of this sign-off.

### Implementation decisions

- `RequirementCoverage.evidence_strength` stores the per-requirement numeric input needed by Task 4.2. Ranked rows also carry coverage entries for requirement filtering and an explicit `context_status` so unavailable contexts are distinguishable from valid zero scores.
- Structured requirements bypass text extraction for any job with a structured list, preserving seed IDs, categories and mandatory flags. On inputs over ten requirements, remaining mandatory lines fill unused slots after the first five mandatory and preferred lines.
- The taxonomy accepts canonical names automatically and prioritizes the longest overlapping alias, so `React.js` does not produce an extra `JavaScript` match from `js`.
- Ranking recomputes observation recency at the explicit reference date without mutating input contexts. The pure pipeline uses deterministic timestamps; API handlers stamp actual UTC result build times at the boundary. Ranked payloads do not contain clock-dependent fields.
- Match storage uses defensive copies, a lock, reference-date keys and context revision checks. Building and failed states are checked before serving cached matches, preventing stale ready scores after a rebuild.
- `POST /api/v1/jobs` (also `/jobs`) registers custom requisitions with the backend so extraction, ranking and profile matches use a real job ID. Custom jobs and matches remain process-local. The existing title, description, location fields and client validation remain intact; help text now accurately describes server-session lifetime.
- CandidateCard role fit remains Unassessed until ranking is triggered, independently of Phase 2 evidence readiness. Active-job changes and Back to default order remove score badges.

### Verification commands

```powershell
$env:DEBUG='false'
.venv\Scripts\pytest backend/tests -q -p no:cacheprovider
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run lint
npm --prefix frontend run test:e2e
```

The DEBUG override avoids an unrelated host value (`release`). Run resource-heavy suites separately on constrained hosts; concurrent browser/build/unit runs caused timing limits, while the final isolated runs passed.
