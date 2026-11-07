# Open functional issues after the UI redesign

Audit date: 7 November 2026. Status: open unless stated otherwise.

Backlog: **48 issues: 10 P1, 37 P2, 1 P3.** The highest-impact items are candidate persistence/deletion, access-policy bypasses, session revocation/sign-out, missing Clerk audit records and mismatched requirement IDs.

The redesigned screens are treated as the accepted UI. This backlog concerns behavior, data correctness, permissions, integration, persistence, and verification. It does not propose another visual redesign. No application fixes were made during this audit.

This is the current audit; `open issue.md`, `PRODUCT_DESIGN_AUDIT.md`, and `REDESIGN_REPAIR_STATUS.md` contain historical findings and sign-offs that do not all describe the present code.

## Scope and evidence

Reviewed the repository structure and the main execution paths across the following folders. Generated bundles, dependencies, virtual environments, caches, databases, images, and secret environment-file contents were excluded from source review. This is a source and automated-test audit, not a claim that every possible runtime defect has been found.

| Area | Review coverage |
| --- | --- |
| Root | Package scripts, README, previous issue/audit reports, Makefile, ignore rules, architecture and deployment assumptions |
| `frontend/src/context`, `pages`, `App.tsx`, `main.tsx` | Authentication, Clerk identity, routing, selected job/candidate state |
| `frontend/src/components/layout`, `dashboard`, `cards`, `common` | Navigation, overview, jobs, creation wizard, uploads, pipeline, results, Talent Pool, discovery, comparison |
| `frontend/src/components/profile`, `evidence`, `graph`, `agent` | Dossier, matching, briefs/questions, resume access, evidence filters/export, graph, assistant |
| `frontend/src/services`, `hooks`, `types` | API contracts, parsing limits, polling, score and context types |
| `frontend/src/test`, `e2e`, configuration and styles | Unit/integration execution, browser acceptance, lint/build, behavioral CSS/layout interactions |
| `backend/routers`, `middleware`, `core` | Endpoint permissions, authentication, audit, masking, retention, startup/database wiring |
| `backend/models`, `repositories`, `migrations` | Durable schema versus actual runtime storage, deletion and restore behavior |
| `backend/services` | Ingestion, deduplication, extraction, scoring, matching, background builds, caching, signal retrieval |
| `backend/services/agent`, `llm`, `graph`, `signal_fetchers` | Tool authorization, grounding, provider errors, graph attribution and synchronization, external-source limitations |
| `backend/tests`, `data` | Full backend suite, fixtures, taxonomy and synthetic/live boundaries |

Evidence labels:

- **Observed**: reproduced by this audit's tests or a local isolated probe.
- **Code-confirmed**: execution path is present in source; not necessarily exercised against a deployed service.
- **Feature gap**: functionality is absent or explicitly unavailable, rather than a newly introduced regression.
- **Needs live verification**: credentials/services/deployment were not exercised.

Priorities: **P1** before production use with real candidate data; **P2** before functional sign-off; **P3** maintenance/documentation. Priorities are suggested, not an externally approved release policy.

## Verification results

| Check | Audit result |
| --- | --- |
| Backend pytest | **356 passed** in 26.63 seconds, using isolated test configuration and `.test-tmp/open-issues-audit` |
| Full frontend Vitest | **81 passed, 5 failed**, 86 total; 3 failing test files |
| Frontend lint | Exit 0, **5 warnings**, detailed in OI-43 |
| TypeScript and Vite production build | **Passed**; Vite warns about a JavaScript chunk above 500 kB |
| Desktop/mobile repair acceptance | **3 passed, 11 failed**, 14 total, in 7.5 minutes; failure classification below |
| Scoring probe | Adding unrelated claims reduced the same Python requirement from `matched` to `partially_supported` without changing its supporting evidence |
| Logout-token probe | Blacklisting an access token left its refresh token usable according to the blacklist check |
| Live Clerk/Google, GitHub, LeetCode, LLM providers, Neo4j, production hosting | Not verified by this audit; mocked/offline tests do not establish live readiness |

Commands used:

```powershell
.\.venv\Scripts\python.exe -c "import os,pytest; os.environ['DEBUG']='false'; raise SystemExit(pytest.main(['backend/tests','-q','-p','no:cacheprovider','--basetemp=.test-tmp/open-issues-audit']))"
npm --prefix frontend run test
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:e2e:repair
```

## Persistence and access restrictions

### OI-01 - Uploaded candidate data disappears on backend restart

**P1 | Code-confirmed.** Resume ingestion writes candidates to `SeedLoader`, resume bytes to `pending_builds`, and contexts to `ContextBuildRegistry`; startup restores custom jobs but not candidates or contexts. SQL candidate/context repositories exist but are not wired into this flow. Upload a new resume, restart the backend, then request its profile: the runtime record is lost.

Sources: `backend/services/deduplicator.py::ResumeIngestionStore.upsert`, `context_builder.py`, `seed_loader.py`, `backend/main.py::lifespan`, `backend/repositories/`.

**Completion:** persist candidate identity, original resume, claims, observations, build revisions and status; restore them after restart. Test the real ingest-restart-read path.

### OI-02 - Multiple backend workers have inconsistent records

**P1 | Code-confirmed.** Candidate stores, build tasks, registry, matching cache and token blacklist are process-local. Custom jobs are restored only at startup: a job created on worker A can appear through worker B's SQL list endpoint but fail worker B's in-memory matching lookup. Process-local email locking also cannot deduplicate across workers.

Sources: `seed_loader.py`, `context_builder.py`, `match_store.py`, `backend/core/security.py::TokenBlacklist`, `routers/jobs.py`, `routers/jd.py::find_job`.

**Completion:** use shared durable repositories/queue and shared revocation state; verify create/upload/rank across workers. Until then explicitly support one worker only.

### OI-03 - Deletion does not cover the actual ingestion and graph stores

**P1 | Code-confirmed.** The delete endpoint first requires a SQL `Candidate`, but uploaded candidates are not inserted there. An uploaded candidate can therefore be visible in the UI yet return 404 on deletion. Even successful SQL deletion removes only the runtime candidate entry; pending resume bytes, context registry, match cache, signal associations and Neo4j data are not cleared or coordinated with in-flight tasks.

Sources: `backend/routers/admin.py::_delete_candidate`, `deduplicator.py`, `context_builder.py`, `match_store.py`, `services/graph/`.

**Completion:** implement one deletion workflow covering every store, cancel obsolete work, and verify deletion of a candidate created through the real upload endpoint.

### OI-04 - Hiring-manager masking and raw-context restrictions can be bypassed

**P1 | Code-confirmed.** List/detail responses mask email and location for managers, and `/context` denies them. However `/candidates/resolve` returns unmasked summaries, `/resume` returns original text, and manager-authorized chat can call `lookup_candidate` and `get_candidate_context` without the caller's role being passed to the tools. The same restricted data can reach the model through another route.

Sources: `backend/core/masking.py`, `routers/candidates.py::resolve_candidates/candidate_resume`, `routers/agent.py::chat`, `services/agent/tools.py`.

**Completion:** enforce one role-aware serialization/tool policy before data leaves the backend, including resume text and assistant inputs. Add manager tests for all alternate access paths.

### OI-05 - New accounts receive recruiter access without workspace admission

**P1 | Code-confirmed; product authorization policy required.** Public native registration and first-time Clerk provisioning both assign `recruiter`. Candidate/job queries are global and have no organization/workspace filter. If deployed for an internal team or multiple customers, a newly admitted identity can access the shared pool unless an external Clerk restriction happens to prevent signup.

Sources: `backend/routers/auth.py::register`, `backend/core/dependencies.py::get_current_user`, `models/db.py`, candidate/job routers.

**Completion:** define permitted enrollment, invite/domain/admin approval and workspace scope; enforce these server-side. Document explicitly if this is intentionally a single shared workspace.

### OI-06 - Native logout leaves refresh credentials valid

**P1 | Observed probe and code-confirmed.** Logout blacklists only the access token's JTI. The refresh token is neither revoked nor rotated, and `/refresh` can mint another access token from it. Revocations also disappear when the process restarts.

Sources: `backend/routers/auth.py::logout/refresh`, `backend/core/security.py::TokenBlacklist`.

**Completion:** persist session/refresh-token families, revoke the family on logout, rotate refresh tokens, and test refresh-after-logout and restart behavior.

### OI-07 - Immediate reload can interrupt sign-out

**P1 | Observed browser failure; code supports the race.** The desktop acceptance flow clicked Sign out, reloaded, and remained at `/dashboard`. `AuthProvider.logout` waits for the network request before clearing session storage in `finally`; reload can abort that work while the old token remains stored.

Sources: `frontend/src/context/AuthContext.tsx::logout`, `components/layout/Sidebar.tsx`; browser failure artifact under `frontend/test-results/redesign-repair-invalid-lo-f0761-s-and-logout-survive-reload-desktop/`.

**Completion:** clear local credentials synchronously when sign-out starts, perform server revocation reliably, and verify immediate reload plus offline sign-out.

### OI-08 - Clerk requests do not produce the expected access audit records

**P1 | Code-confirmed.** Audit middleware decodes bearer tokens using the native JWT secret. Clerk requests are authenticated through a different verifier, so their tokens fail this decode and auditing returns early. Audit writes also swallow every storage error; missing SQL candidate rows can make candidate-linked log writes fail silently. Client-side exports never call an audited export endpoint.

Sources: `backend/middleware/audit.py`, `backend/core/dependencies.py`, `models/db.py::AuditLog`, frontend export functions.

**Completion:** audit the already-verified principal, make delivery observable/reliable, reconcile candidate foreign keys and record export events explicitly.

## Job matching and candidate intelligence

### OI-09 - New jobs use different requirement IDs in frontend and backend

**P1 | Code-confirmed.** Job creation assigns persisted IDs such as `CUSTOM-...-REQ-001`, but `JobContext.createCustomJob` overwrites the returned requirements with the pre-save extraction/manual requirements. Comparison then joins backend coverage to frontend requirement IDs and can show zero matched mandatory skills until reload. JD Match separately fetches canonical requirements, so screens can disagree.

Sources: `frontend/src/context/JobContext.tsx::createCustomJob`, `backend/routers/jobs.py::create_job`, `CandidateComparisonView.tsx`.

**Completion:** keep the server-returned job/requirements as canonical; test create job, compare immediately, and compare again after reload.

### OI-10 - Overview coverage is a different calculation from JD Match

**P2 | Code-confirmed.** `IntelligenceOverview` counts any observation whose raw skill text is a substring of a requirement. It does not use canonical taxonomy or backend coverage states, claim support, recency or evidence thresholds. Thus mandatory/preferred counts can disagree with both comparison and JD Match.

Source: `frontend/src/components/profile/IntelligenceOverview.tsx::coverage` versus `backend/services/ranking_engine.py::build_match`.

**Completion:** drive all role-specific coverage from the same match response and explicit loading/error states.

### OI-11 - Unrelated resume claims can downgrade requirement coverage

**P2 | Observed scoring probe; scoring-policy review.** Matching divides claims for one requirement by *all* non-contradicted candidate claims. With fixed Python evidence strength of 0.5, one Python claim alone was `matched`; adding two unrelated React claims changed it to `partially_supported`. This makes broader resumes score worse for the same demonstrated requirement.

Source: `backend/services/requirement_matcher.py::match_claims_to_requirement/classify_coverage`.

**Completion:** agree a per-requirement support measure and test invariance when unrelated resume claims are added. Existing unit tests passing does not validate this product assumption.

### OI-12 - Skill labels do not consistently resolve aliases or conflicts

**P2 | Code-confirmed.** Overview/comparison join skills by lowercased exact text, while backend matching resolves aliases. `Kafka`, `Apache Kafka`, or repository-topic variants can be treated as different skills. Comparison reports `Unverified` for reported skills without inspecting supported/contradicted claims; overview prefers `Demonstrated` whenever any observation exists, even if a claim conflicts.

Sources: `IntelligenceOverview.tsx`, `CandidateComparisonView.tsx`, `backend/services/taxonomy.py`.

**Completion:** publish canonical skill IDs and separate claim state from observation availability. Verify alias, contradiction and supported-claim cases across screens.

### OI-13 - Rankings stay pending after background analysis finishes

**P2 | Code-confirmed.** Talent Pool, candidate results and Jobs fetch rankings once. Their effects do not subscribe/poll when rows are `building`; the eventual ready result does not cause a refresh. Talent Pool has no normal assessment refresh control, and Jobs reranks only when the job-ID list changes. Users must leave/re-enter or reload to see completion.

Sources: `TalentPoolView.tsx`, `CandidateResultsView.tsx`, `JobsView.tsx` ranking effects.

**Completion:** poll boundedly while processing, refresh when context revisions change, and provide retry after exhaustion.

### OI-14 - Comparison context requests can remain pending forever

**P2 | Code-confirmed.** Comparison polls match results, but fetches each context only once. A 202 context is discarded and context failures are silently absorbed by `Promise.allSettled`. Scores can become ready while skills, experience and projects remain `Evidence pending`/unavailable.

Source: `CandidateComparisonView.tsx` context-fetch effect.

**Completion:** track context loading/error/building states per candidate, poll until completion and show actionable failures.

### OI-15 - Comparison retry does not recover several failure states

**P2 | Code-confirmed.** The candidate-list effect runs only on mount, so Retry comparison never retries a failed list request. Match polling stops after ten calls without an exhausted message/retry action; a returned `status: failed` is displayed but creates no retry button. `Promise.all` also discards successful candidate matches if another request rejects.

Source: `CandidateComparisonView.tsx` list/match effects and error rendering.

**Completion:** retry the failed resource, retain successful columns, and provide explicit per-column terminal/exhausted recovery.

### OI-16 - Comparison selections disappear during profile inspection

**P2 | Code-confirmed.** Selected IDs are component-local state. Opening a candidate unmounts comparison; returning initializes only the most recently selected candidate. A recruiter cannot compare three candidates, inspect one, and resume the same set.

Sources: `CandidateComparisonView.tsx::ids`, `frontend/src/context/JobContext.tsx`.

**Completion:** preserve the comparison set in workspace state or URL; test profile round-trips and job changes.

### OI-17 - Briefs/questions can belong to the previously selected job

**P2 | Code-confirmed.** Switching the header's selected job while Brief & Questions remains mounted does not clear previously generated brief/questions. An export action can download the cached old-job brief. CandidateProfileShell is keyed by candidate only; BriefQuestionsTab does not key/reset content on `jobId` changes.

Sources: `CandidateProfileShell.tsx`, `BriefQuestionsTab.tsx`.

**Completion:** scope generation state and in-flight responses to candidate, job and context revision; display that scope on downloaded content.

### OI-18 - Replacing a resume can retain stale skills and profile links

**P2 | Code-confirmed.** Deduplication keeps existing `top_skills` when the new document extracts none, and merges new links without removing old links. A replacement resume can therefore keep an outdated GitHub account or obsolete skills and enrich from them.

Source: `backend/services/deduplicator.py::ResumeIngestionStore.upsert`.

**Completion:** distinguish authoritative replacement from intentional metadata preservation, expose corrections/removal, and test removal of skills/links on replacement.

### OI-19 - Source outages look like a successful lack of evidence

**P2 | Code-confirmed.** Signal adapters return `[]` for network/API failures and invalid/no profiles. The context builder cannot distinguish these expected failures from a genuinely empty source and can publish ready with `No public evidence`. Its unavailable-source metadata is not included in the public context response. GitHub also abandons all retrieved repositories when any selected commit request fails.

Sources: `services/signal_fetchers/github.py`, `leetcode.py`, `services/context_builder.py::collect`, `routers/candidates.py::candidate_context`.

**Completion:** return structured source outcomes, preserve partial successes and expose retryable outages separately from evidence gaps.

## Knowledge graph

### OI-20 - Graph retains obsolete nodes/edges after resume replacement

**P2 | Code-confirmed.** Seeding only MERGEs current skills/repositories; it does not remove relations absent from the new context or validate context revisions before publishing graph writes. Old skills/projects and competing old/new seed tasks can leave the graph inconsistent with the dossier.

Sources: `backend/services/graph/seeder.py`, `context_builder.py::_seed_graph`.

**Completion:** reconcile candidate-scoped graph state transactionally by revision and test replacement/removal plus overlapping builds.

### OI-21 - Graph labels imply contributions that source evidence does not establish

**P2 | Code-confirmed.** Every evidence URL, including LinkedIn/LeetCode, becomes a `Repository` with `CONTRIBUTED_TO` and `DEMONSTRATES` links. GitHub observations explicitly disclaim authorship, yet the graph asserts contribution. Repository nodes also lack a title/name, so the redesigned graph can display long candidate-prefixed IDs instead of readable project names.

Sources: `backend/services/graph/seeder.py::records`, GitHub observation text, `GraphVisualization.tsx` title/subtitle rendering.

**Completion:** model source/observation/project types and attribution accurately; store human-readable labels and do not infer authorship from repository presence.

### OI-22 - Graph view filters are not the full projects/sources experience

**P2 | Feature gap.** Sources contains only candidate/repository nodes, with no actual GitHub/LinkedIn/LeetCode source nodes. Projects can be identical to Candidates + Skills for common graphs. Automatic context seeding never passes a job ID, so the seeder's Job/Requirement path is not populated by the normal upload flow. The heading names the selected role, but the graph request is candidate-only and does not change with the job. Repository/Job/Requirement nodes are exposed as keyboard-focusable buttons, but their selection handler has no action.

Sources: `GraphVisualization.tsx::displayedNodes`, `context_builder.py::_seed_graph`, `services/graph/seeder.py`.

**Completion:** define and wire job-scoped graph data, meaningful view modes and real source types; do not imply a role-specific graph before it exists.

### OI-23 - Slow graph evidence responses can overwrite a newer selection

**P2 | Code-confirmed.** Selecting skill A and then B starts uncancelled requests; A can finish last and replace B's results. Closing the panel or changing candidate also does not invalidate the select handler's request. While loading, the panel says no observations found, and a skill error reuses the whole-graph message area.

Source: `GraphVisualization.tsx::select`.

**Completion:** key/cancel requests by candidate and skill, track loading/error separately, and verify out-of-order responses.

## Uploads and processing

### OI-24 - Batch upload declares completion at HTTP 202

**P2 | Code-confirmed.** Each file is marked `Complete` immediately after upload acceptance, although the backend returns `status: building`. Candidate IDs are discarded and there is no per-file context polling, later failure state, or direct result navigation. A batch can say all complete while analysis fails in the background.

Source: `AddCandidatesView.tsx::uploadBatch` and `backend/routers/ingest.py::IngestResponse`.

**Completion:** track accepted/uploaded separately from analyzed/failed and retain candidate IDs/revisions for status and navigation.

### OI-25 - Batch queue identity and retry use filenames instead of file entries

**P2 | Code-confirmed.** Results are keyed by filename. Removing a completed file and adding a different file with the same name retains `Complete`, so the upload loop skips it. Same-name files in one incoming selection are not deduplicated against each other, yet share a result key and React key.

Source: `AddCandidatesView.tsx::add`, `results`, `uploadBatch`.

**Completion:** assign stable per-entry IDs, clear status on replacement, and test same-name files and remove/re-add.

### OI-26 - Batch identity failures cannot be corrected in place

**P2 | Code-confirmed.** The backend requires extracted name/email. Single upload offers correction fields; batch sends only bytes and reduces every error to a generic retry. A resume missing identity will fail repeatedly with no way to fix that entry. Navigating away also loses the local queue/results while accepted work continues.

Source: `AddCandidatesView.tsx` versus `ResumeUpload.tsx`, `backend/routers/ingest.py`.

**Completion:** surface structured errors and editable per-file identity, preserve queue state across navigation, and distinguish rejected input from retryable network failures.

### OI-27 - Retry evidence does not restart a failed context build

**P2 | Code-confirmed.** Context GET returns 503 for a failed registry entry and only launches work when the entry is absent. Frontend retry just repeats that GET. Backend messages say retry the build, but there is no normal authorized rebuild endpoint/action for that candidate.

Sources: `backend/routers/candidates.py::candidate_context`, `context_builder.py::_fail`, `frontend/src/hooks/useCandidateContext.ts`.

**Completion:** provide a bounded, authorized rebuild action or explicitly route recovery to corrected re-upload. Test a terminal failed build recovering.

### OI-28 - Pipeline stages are inferred rather than measured

**P2 | Feature gap.** The pipeline exposes only aggregate context readiness. Stages update together, Job Matching remains pending even when analysis is ready, and Project Analysis counts only `project_submission`, excluding GitHub repository evidence. GitHub/LinkedIn discovery is profile-link enrichment, not independent identity discovery.

Sources: `PipelineAnalysisView.tsx`, `context_builder.py`, ingestion/context API responses.

**Completion:** publish actual stage states/timestamps and run matching where promised, or explicitly describe aggregate processing. Verify stage results against returned observations.

### OI-29 - Claim verification/contradiction assessment is not implemented

**P2 | Feature gap.** Extracted claims default to unverified and there is no production workflow marking them supported/contradicted or resolving conflicts. The overview contradiction count is consequently usually zero rather than evidence that checks found no conflicts. The extractor also only accepts recognized bullet/action/skill combinations, caps at 20 claims, and does not include Redis or bare Kafka in its keyword list.

Sources: `backend/services/claim_extractor.py`, `context_builder.py`, `models/context.py`, `IntelligenceOverview.tsx`.

**Completion:** distinguish not-assessed from assessed-zero, define verification/review operations, and cover representative resume formats and taxonomy aliases. Do not silently call available observations verified claims.

## Unfinished product behavior

### OI-30 - Candidates are not associated with the job used for upload

**P2 | Feature gap.** Add Candidates names a selected job, but upload sends no job/application identifier. Ranking evaluates the global pool. There is no maintained job-candidate membership to drive per-job resume/analyzed/processing counts or an actual application pipeline.

Sources: `ResumeUpload.tsx`, `AddCandidatesView.tsx`, `backend/routers/ingest.py`, `routers/jd.py`, `models/db.py::ApplicationHistory`.

**Completion:** persist candidate applications/job membership separately from reusable profiles and drive per-job counts/results from it.

### OI-31 - Job lifecycle, editing and activity remain unavailable

**P2 | Feature gap/code-confirmed.** Jobs has Active/Draft tabs that force an empty result for every non-All status; the backend has no status field. Overview nevertheless labels all available jobs `Active Jobs`. Existing-job Edit is disabled; job activity is an unavailable message. Employment type, experience range and manager are stored as description text rather than independently managed fields. The new client-side job search omits `job.id` and `requirements_preview`, so searching `JOB-001` finds no workspace even though the backend supports ID search; this also blocks the browser ranking scenario before its obsolete ranking selectors are reached.

Sources: `JobsView.tsx`, `OverviewDashboard.tsx`, `JobDetailWorkspace.tsx`, `backend/models/db.py::Job`.

**Completion:** define lifecycle/status/edit/activity contracts and structured fields, or keep unavailable concepts explicit without presenting known-looking zero counts. Align local search with the backend's supported ID/requirement search contract.

### OI-32 - Discovery and candidate evidence collection have no working workflow

**P2 | Feature gap.** Talent Discovery routes users back to basic search. There is no natural-language discovery action. The gaps panel reviews existing claims but does not request/deliver/collect candidate evidence. No private project submission or interview feedback entry workflow populates those evidence/history concepts.

Sources: `TalentDiscoveryView.tsx`, `IntelligenceOverview.tsx`, available backend router set, `context_builder.py` context construction.

**Completion:** define the intended scope, implement the necessary APIs and delivery/submission flows, and test an end-to-end round-trip rather than only navigation.

### OI-33 - Notifications, settings and administrative UI are absent

**P2 | Feature gap.** Notifications and Settings are disabled. There is no UI for role administration, retention settings, candidate deletion or audit log review despite some backend administration endpoints. There is also no self-service account/profile management route within this app.

Sources: `Header.tsx`, `Sidebar.tsx`, `App.tsx`, `backend/routers/admin.py`.

**Completion:** implement the agreed account/admin workflows or document them as external administration responsibilities.

## Authentication, retention and operational behavior

### OI-34 - Native sessions do not refresh automatically

**P2 | Code-confirmed.** Reload validates only the stored access token; if it expired, it clears both credentials rather than trying refresh. API 401s do not trigger refresh/re-authentication handling. `refreshToken` exists but has no automatic caller. Production login UI requires Clerk; native login is deliberately available only to tests/development.

Sources: `AuthContext.tsx`, `frontend/src/services/api.ts`, `pages/GoogleLogin.tsx`.

**Completion:** decide supported production auth modes, implement refresh/retry/expiry handling for native mode, and validate paired frontend/backend Clerk configuration.

### OI-35 - Native OAuth state/email handling needs hardening

**P1 | Code-confirmed for the alternate native OAuth path.** OAuth state is stored globally by random token, without binding it to the initiating browser, and expired entries are not periodically removed. Callback accepts a returned email without explicitly checking Google's `email_verified`; GitHub's direct email path bypasses the verified-email fallback check. Account linking uses email alone. This is separate from the redesigned Clerk Google login.

Source: `backend/routers/auth.py::_oauth_states/oauth_authorize/oauth_callback`.

**Completion:** bind state to the initiating session, validate verified identity before account linking, clean expired state and test callback/replay/unverified-email paths.

### OI-36 - Retention does not govern runtime evidence and original resumes

**P2 | Code-confirmed.** Startup purges expired SQL evidence only. Active contexts, original resume bytes in `pending_builds`, in-memory matches and Neo4j copies have no matching retention lifecycle; ready contexts are not rebuilt simply because cache data expires. There is no scheduled purge during a long-running process.

Sources: `backend/core/retention.py`, `backend/main.py`, `deduplicator.py`, `context_builder.py`, `match_store.py`, graph seeder.

**Completion:** apply a documented retention/refresh policy to every store with scheduled enforcement, and test expiry while the server remains running.

### OI-37 - Synthetic-data filtering is not enforced on the runtime route

**P2 | Code-confirmed.** The list route checks whether to set `X-Synthetic-Data` but does not invoke the existing synthetic filter on the runtime candidate list. A synthetic LinkedIn fixture can also enter context scoring without an admin opt-in if configured. Production currently starts without bundled demo candidates, which reduces exposure but is not route-level enforcement.

Sources: `backend/routers/candidates.py::list_candidates`, `backend/core/synthetic.py`, `signal_fetchers/linkedin.py`, `context_builder.py`.

**Completion:** enforce provenance policy across candidate lists, contexts, ranking, graphs and exports; test non-admin reads when synthetic records are present.

### OI-38 - Resource limits do not cover several expensive API paths

**P2 | Code-confirmed.** Upload bytes are bounded, but JD text/requirements and chat history content are not comprehensively bounded at the API schema. History is sliced only after validation. Public auth, LLM calls and ingestion have no application rate/admission limits. Frontend evidence/overview/platform filtering fetches all candidates and fans out context/detail calls; Jobs ranks the whole pool once for each job.

Sources: `routers/auth.py`, `routers/jd.py::ExtractRequest`, `models/job.py`, `routers/agent.py::ChatRequest`, `EvidenceExplorer.tsx`, `OverviewDashboard.tsx`, `TalentPoolView.tsx`, `JobsView.tsx`.

**Completion:** add server-side input limits and admission/rate controls appropriate to deployment; paginate/batch lists and use summary/filter APIs. Measure larger pools beyond the six-candidate fixtures.

### OI-39 - Refresh/back navigation does not restore the current workspace

**P2 | Code-confirmed.** Screen, selected job, selected candidate and comparison IDs live in React state. Most navigation does not change the URL. Reload resets to Overview/Talent Pool and the first job, and browser Back/Forward cannot traverse the actual screen flow. A profile/graph/comparison cannot be directly linked with its state.

Sources: `frontend/src/context/JobContext.tsx`, `frontend/src/App.tsx`.

**Completion:** encode view/job/candidate/comparison selection in routes or persist explicit workspace state; test reload, links and browser history.

### OI-40 - Dashboard summaries can hide partial failures

**P2 | Code-confirmed.** Per-candidate context fetch failures are converted into failed rows, but the dashboard's global failure flag remains false. Metrics can show zero analyzed/evidence without identifying that retrieval failed. Polling stops after ten calls without an exhausted/retry notice. Recent activity is generated from context readiness, not a persistent event feed.

Source: `frontend/src/components/dashboard/OverviewDashboard.tsx`.

**Completion:** show partial/error/stale status for aggregate metrics and actionable polling exhaustion; define whether activity is a snapshot or a durable feed.

### OI-41 - Export scope and provenance are incomplete

**P2 | Feature gap/code-confirmed.** Candidate export downloads an AI brief TXT, not the complete intelligence dossier shown in the references. `formatBrief` omits candidate/job metadata, generation/reference date and the separate grounding-ID list. Evidence JSON includes provenance, but frontend-only downloads are not separately audited. Chat/history and generated deliverables have no durable product retrieval flow.

Sources: `BriefQuestionsTab.tsx::formatBrief/downloadBrief`, `EvidenceExplorer.tsx::exportEvidence`, `ChatDrawer.tsx`, backend agent router/repositories.

**Completion:** specify export deliverables and include identity, scope, timestamps and citations; record authorized exports and persist generated content/history if required.

## Verification, configuration and maintenance

### OI-42 - Full frontend regression suite is failing

**P2 | Observed: 5 failed, 81 passed.**

| File | Failures | Evidence |
| --- | --- | --- |
| `frontend/src/test/evidence.test.tsx` | 1 | Expects the claim `Built Python services` on the default profile view; default changed to overview |
| `frontend/src/test/workspace.test.tsx` | 2 | Talent Pool now calls `api.rankCandidates`, absent from this test's API mock; component errors during navigation |
| `frontend/src/test/matching.test.tsx` | 2 | Expects the previous Talent Pool `Unassessed`/`Rank by fit` experience |

These failures include outdated contracts/mocks and are not proof that each old behavior must be restored. They still leave the redesign without a green regression baseline. New overview/comparison/graph states lack targeted coverage for the defects above.

**Completion:** update tests to accepted behavior, retain equivalent behavioral assertions, add regression cases for fixes and run the full suite rather than relying on individual passing files.

### OI-43 - Browser acceptance and lint no longer support the previous sign-off

**P2 | Observed/code-confirmed.** The repair browser suite still targets `View Profile`, `Add Candidates`, `Rank by fit`, old wizard field/button labels and old pipeline headings. Its wizard scenario also uses an unscoped `Create Job` locator that now matches two valid buttons. Some failures are stale locators; sign-out/reload (OI-07) and Jobs ID search (OI-31) are separate behavior issues. Desktop and mobile need a refreshed acceptance run after tests are reconciled.

Lint reports five warnings: three `react(set-state-in-effect)` warnings and one missing `selectedJob` dependency in `TalentPoolView.tsx`, plus an empty-destructuring warning in `e2e/phase5.spec.ts`. Lint exits 0, so it is not currently a warning-free gate.

**Completion:** update accepted-flow browser tests, verify role restrictions and mobile controls, distinguish genuine regressions from locator changes, and resolve/justify lint warnings.

### OI-44 - Documentation and duplicate legacy components describe different products

**P3 | Code-confirmed.** `open issue.md` references removed login controls, obsolete API paths and features now implemented; README phase sections conflict with newer persistence/auth behavior. `REDESIGN_REPAIR_STATUS.md` records 67 passing frontend tests and 14 passing browser tests from an earlier state, not this audit. Old `CandidateGrid`/`CandidateCard`, `LoginPage`, `DashboardOverview` alias and other legacy paths coexist with new screens. Some user-facing strings also contain literal `?` substitutions or mojibake after encoding changes.

**Completion:** designate current architecture/API/backlog documents, label historical sign-offs with their scope, remove or clearly isolate unused components, and normalize source text encoding without redesigning the UI.

### OI-45 - Document and requirement contracts differ between layers

**P2 | Code-confirmed.** The wizard advertises 10 MB, but `extractDocumentText` rejects above 5 MB. The browser parser checks 100,000 characters only after PDF/DOCX extraction and lacks the backend's PDF-page/expanded-DOCX limits. Additional requirement text is appended after the extraction call; when structured requirements already exist, backend matching bypasses description extraction, so those additions may never become assessed criteria. Extraction failure can also cause backend re-extraction despite frontend marking extraction failed.

Sources: `CustomJDModal.tsx::save/read`, `frontend/src/services/documentText.ts`, `JobContext.tsx::createCustomJob`, `backend/routers/jobs.py::create_job`, `requirement_extractor.py::requirements_for_job`.

**Completion:** align limits and extraction rules, include all assessed text before extraction, preserve explicit failure/empty states and show exactly which requirements will be scored.

### OI-46 - Deployment and live integration sign-off is still outstanding

**P2 | Needs live verification/code-confirmed configuration gap.** Browser API URLs are same-origin and the repository supplies a Vite development proxy, but no production reverse-proxy/deployment configuration. Startup `create_all` creates missing tables but does not apply Alembic changes to existing tables. Neo4j requires both connection configuration and graph seeding enabled; a default deployment cannot populate the graph. LinkedIn is fixture-only, and live identity, signal and AI-provider availability has not been demonstrated by offline suites.

Sources: `frontend/vite.config.ts`, `frontend/src/services/api.ts`, `backend/core/database.py::create_all_tables`, `backend/main.py`, `backend/config.py`, migrations and signal/graph adapters.

**Completion:** document/test a deployment with SPA fallback and `/api` routing, run migrations as a deployment step, validate health/readiness for configured dependencies, and perform authenticated live smoke tests without committing secrets.

### OI-47 - Administrative rebuild clears restored custom jobs from matching

**P2 | Code-confirmed.** Rebuild calls `repository.reload()`, which clears jobs/candidates and loads no demo data in production. Unlike application startup, the rebuild path never calls `restore_custom_jobs`. Persisted custom jobs can still appear through SQL-backed listing/detail while matching returns Job not found until backend restart. Rebuild also discards uploaded runtime candidates, reinforcing OI-01.

Sources: `backend/services/context_builder.py::rebuild`, `seed_loader.py::load_all/reload`, `backend/main.py::lifespan`, `routers/jd.py::find_job`.

**Completion:** define rebuild scope, preserve durable records and rehydrate matching state atomically. Test create custom job, admin rebuild, list, extract and rank without restarting.

### OI-48 - Validated native registration passwords can fail during hashing

**P2 | Observed local probe.** RegisterRequest accepts passwords up to 128 characters, but the installed bcrypt implementation rejects more than 72 bytes. Hashing an 80-character ASCII password raised `ValueError`; registration does not catch that error, so an input accepted by the request model can produce HTTP 500. Byte and character limits also differ for multibyte passwords.

Sources: `backend/routers/auth.py::RegisterRequest/register`, `backend/core/security.py::hash_password`.

**Completion:** align password validation with the hashing scheme, return a clear validation response, and test byte boundaries and Unicode without silently truncating passwords.

## Suggested implementation order

1. Resolve persistence and permissions first: OI-01 through OI-08 and OI-35. Establish the intended single-workspace or multi-workspace access model.
2. Correct canonical requirement IDs and unified matching/skill state: OI-09 through OI-12 and OI-18/OI-19.
3. Finish asynchronous recovery and batch tracking: OI-13 through OI-17 and OI-24 through OI-29.
4. Reconcile graph attribution/revisions and job scope: OI-20 through OI-23.
5. Implement the agreed product gaps and operational contracts, then update the complete test/documentation baseline and perform live integration sign-off.

## Final audit execution status

All audit commands have completed. Build passed, backend tests passed, and frontend/browser verification is not green. The earlier per-screen passing test runs were narrower than this full-repository audit.

Browser acceptance classification:

| Scenario | Desktop | Mobile | First observed blocker |
| --- | --- | --- | --- |
| Login/protected routes/logout/reload | Failed | Passed | Immediate reload after Sign out restored the desktop workspace; OI-07 |
| Manager permissions | Failed | Failed | Old `View Profile` button locator; later assertions were not reached |
| Wizard save/reload | Failed | Failed | `Create Job` matched two buttons; later save/persistence assertions were not reached |
| Actual resume upload/analysis | Failed | Failed | Old `Add Candidates` button locator; this run did not reach upload |
| Processing failure/retry | Failed | Failed | Old `View Profile` button locator; injected context failure was not inspected |
| Job-specific rankings/comparison | Failed | Failed | Search `JOB-001` produced no Open workspace button; OI-31 |
| Evidence filters/export/provider unavailability/accessibility scenario | Passed | Passed | No failure in this scenario; its accessibility check is not coverage of every redesigned screen |

Failure context and retained traces are under `frontend/test-results/`. Backend and browser tests used isolated fixtures/test configuration. No live identity/provider/graph readiness claim is made. The audit added this file only; existing application changes and the historical `open issue.md` were left intact.
