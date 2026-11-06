# Skitrace product and redesign audit

Reviewed: 6 November 2026. Baseline: `0a1f1aa` (15-screen redesign), compared with its parent where relevant.

## Verdict

The product idea is useful: help recruiters connect resume claims to attributed evidence, evaluate a specific role, and decide what to ask next. The redesigned workspace expresses that workflow clearly. However, it currently mixes real backend results with invented candidates, scores, evidence and processing states. This undermines the product's central promise of trustworthy evidence. The commit's “zero functional regressions” claim is not supported by this review.

This is a source review plus frontend verification, not a completed live-service, browser, accessibility or security certification. “Implemented” below means the code path exists; it does not certify deployment configuration or live external services. No application fixes are included in this report.

## What is right

| Area | What is present | Evidence / limit |
| --- | --- | --- |
| Product focus | Claims, evidence, role requirements and interview questions form a useful recruiter workflow. Human decision support is the stated goal. | `PRD.md`, sections 1–2. |
| Navigation and design structure | Separate job workspace, candidate dossier, comparison, evidence, discovery and pipeline views give the product a clearer structure. | `frontend/src/App.tsx`. This is a structural judgment; visual fidelity to original mockups was not assessed. |
| Existing candidate workflow | The overview still mounts the API-backed candidate grid, filtering, ranking and real resume upload. | `DashboardOverview.tsx`, `CandidateGrid.tsx`, `ResumeUpload.tsx`. These paths should be reused by the new screens. |
| Job storage | Job loading and creation still call the backend. | `frontend/src/context/JobContext.tsx`: `getJobs`, `createJob`. |
| JD ingestion | File text extraction and requirement extraction remain connected; saving errors can be surfaced. | `CustomJDModal.tsx`, `services/documentText.ts`. Structured wizard fields have gaps described below. |
| Candidate detail tools | Real candidate/context loading, JD matching, resume viewing, briefs/questions and chat still have API-backed implementations. | `CandidateProfileShell.tsx`, `JDMatchTab.tsx`, `ResumeViewer.tsx`, `BriefQuestionsTab.tsx`, `ChatDrawer.tsx`. Their presence does not validate the added static overview content. |
| Graph foundation | Candidate graph retrieval and skill evidence retrieval exist, with unavailable/error handling. | `GraphVisualization.tsx`: `getCandidateGraph`, `getGraphEvidence`. A new graph endpoint is not automatically required. |
| Build and existing tests | Frontend tests and production compilation pass. | 65 tests across 6 files; TypeScript and Vite production build pass. See verification below. |

## What is wrong or incomplete

Priority: P0 = release blocker; P1 = core workflow/data integrity; P2 = usability, scope or accuracy gap. Findings are confirmed from code unless explicitly marked as a risk.

| ID | Priority | Finding and impact | Source | Required correction / acceptance check |
| --- | --- | --- | --- | --- |
| 01 | P0 | Authentication now starts with a default admin user and `demo-session-token` in ordinary runtime. Any login failure is caught and converted into a successful local demo session with `hr_admin`. Failed identity lookup retains the default user. | `context/AuthContext.tsx`; the parent used Clerk identity/token hooks. | Restore trusted identity and roles. With empty storage, show login; invalid credentials/network errors must leave the user signed out. Verify the configured Clerk flow. This is a frontend authentication failure; it does **not** prove the backend accepts forged tokens. |
| 02 | P1 | New Add Candidates stores file display metadata and navigates to Pipeline; it never uploads the file. A parsed sample resume and batch files are preloaded. A recruiter can believe ingestion happened when no candidate was created. | `dashboard/AddCandidatesView.tsx`; contrast `ResumeUpload.tsx`, which calls `api.uploadResume`. | Keep the actual File, submit it to ingestion, handle validation/errors, and carry the returned candidate ID into subsequent views. Verify a unique resume appears in backend results. |
| 03 | P1 | Pipeline progress increases on a timer without reading processing status. It shows a fixed Maya resume and opens `CAND-001`; “Cancel analysis” only navigates away. | `dashboard/PipelineAnalysisView.tsx`. | Poll the actual candidate context; display ready/failed truthfully. Navigation must not claim cancellation unless a backend cancellation actually occurred. |
| 04 | P1 | Job workspace candidates, fit, coverage and identity statuses are hardcoded. Selecting another job changes the title but not the underlying evaluation. Local filters operate on invented records. | `dashboard/JobDetailWorkspace.tsx`: `candidatesData`. | Load actual candidates and role-specific matches. Switch between materially different jobs and verify scores/coverage come from their respective API responses. |
| 05 | P1 | Talent Pool uses a fixed candidate array rather than the candidate API. Only local name/role search affects results; skill and evidence pills do not participate in filtering. The global header search is also not consumed here. `/candidates` now renders this view. | `dashboard/TalentPoolView.tsx`, `App.tsx`, `layout/Header.tsx`. | Use shared candidate data and all displayed filter criteria. A newly uploaded candidate must appear and be discoverable through advertised search controls. |
| 06 | P1 | Evidence Explorer fetches real contexts, but its visible evidence cards and export use `visualEvidenceItems`. Search/platform/skill/verified controls do not filter that rendered list. The displayed 1,240 count is fixed. | `evidence/EvidenceExplorer.tsx`. | Render and export actual attributed evidence; derive counts and all filters from the same dataset. Empty results must not leave sample evidence cards visible. |
| 07 | P1 | Candidate dossier combines real profile fetching with a fabricated Maya fallback, fixed Job Fit 92 and Evidence 94%, and static overview material. This can show one candidate's identity beside unrelated assessment content. | `profile/CandidateProfileShell.tsx`. | Show loading until data arrives, then derive every assessment from that candidate/context and selected job. Test two distinct candidates, a slow request and a failed request. |
| 08 | P1 | Comparison always displays Maya/Jonas and fixed evidence/fit rows. “Add candidate” navigates away without managing selection. Profile Compare goes to the candidate pool rather than establishing a comparison. | `dashboard/CandidateComparisonView.tsx`, `profile/CandidateProfileShell.tsx`. | Maintain selected candidate IDs, load their actual matches, and compute differences. Adding/removing a candidate must update the table; changing jobs must update coverage. |
| 09 | P1 | Discovery has no editable natural-language query, returns fixed results, and simulates search with a 600 ms timeout. Evidence/location toggles do not change results. | `dashboard/TalentDiscoveryView.tsx`. | Either mark this as an unavailable preview or connect editable input and filters to real retrieval. A vector database is a possible implementation choice, not a prerequisite for fixing this misleading behavior. |
| 10 | P1 | Wizard collects employment type, experience, manager and mandatory/preferred skills, but creation passes only title, description, department, location and extracted requirements. Those edited fields are not explicitly persisted by these save paths. Final save prefers prefilled full JD text over the entered summary and supplies a fallback title before checking for an empty title. | `dashboard/CustomJDModal.tsx`: `handleSaveFinal`, `handleQuickSave`; `context/JobContext.tsx`. | Persist every supported field deliberately, remove unrelated defaults, validate the actual submitted input and invalidate extraction after JD edits. Verify edits survive a save/reload and requirements match the submitted JD. |
| 11 | P1 | “Request Evidence” changes a boolean to “Evidence Requested” without sending or storing a request. | `profile/CandidateProfileShell.tsx`: `requestEvidenceSent`. | Implement delivery/persistence and report confirmed success, or label the capability unavailable. Clicking it must not imply delivery from local state alone. |
| 12 | P2 | Dashboard includes fixed evidence totals, top-fit labels and featured candidates. Jobs injects sample requisitions when fewer than four real jobs exist. | `dashboard/DashboardOverview.tsx`, `dashboard/JobsView.tsx`. | Derive metrics/cards from real data; use honest empty states. Any demo mode must be explicit and isolated from real records. |
| 13 | P2 | Notifications and Jobs Filter are enabled controls without action handlers. Header promises jobs/candidates/skills search but updates candidate search state rather than implementing that advertised global behavior. | `layout/Header.tsx`, `dashboard/JobsView.tsx`. | Wire each control, narrow its label, or disable it with an explanation. Verify visible results respond to search in the current view. |
| 14 | P2 | Login asserts “SOC 2 Type II certified” without substantiation in this review, and Privacy Policy points to `#`. | `pages/LoginPage.tsx`. | Remove the certification assertion until substantiated; link approved legal content. No conclusion about actual certification status is made here. |
| 15 | P2 | “Export Report” activates the existing brief export, which does not establish a complete composite evidence dossier export. | `profile/CandidateProfileShell.tsx`, `BriefQuestionsTab.tsx`. | Name it “Export brief” or define and implement the full report. Verify downloaded content matches the promised scope and current candidate/job. |

Most new mockup-only screens are incomplete additions; authentication is a directly established regression against the parent commit. Existing backend services and older working components should be reused before adding new infrastructure.

## Product idea: decisions to preserve or change

- **Preserve:** evidence provenance, explicit unknowns, separate claims and observations, job-specific coverage, and questions that help a human validate gaps.
- **Change:** never treat “no public repository found” as a contradiction. The static Evidence Explorer labels a Kafka claim “Contradictory” because no repo was found; that demonstrates missing evidence, not a disproven claim.
- **Change:** “Verified” must have a defined verification rule and supporting provenance. Repository topics, platform activity and generated prose alone do not establish authorship or production experience.
- **Change:** explain what fit scores measure and keep resume coverage separate from external evidence strength. Fixed or unexplained percentages give false precision.
- **Scope:** first complete one trustworthy flow: sign in → create/select role → upload resume → actual processing status → candidate evidence → role match → interview brief. Discovery and comparison can follow once they use the same reliable data.
- **Evaluation risk:** public-code visibility varies across candidates and roles. Treat sparse evidence as unknown and provide ways to assess private work and interview evidence. This is a product-design concern, not a measured fairness finding from this audit.

## Verification performed

| Check | Result |
| --- | --- |
| `npm --prefix frontend test` | PASS: 65 tests, 6 files. jsdom reports unimplemented `window.scrollTo`; tests still pass. |
| `npm --prefix frontend run build` | PASS: TypeScript and Vite build. Main JS chunk approximately 596 kB; Vite emits a bundle-size warning. |
| `npm --prefix frontend run lint` | Exit 0, four warnings: JobsView synchronous state update in effect; AuthContext mixed exports; phase5 E2E empty destructuring; CustomJDModal cleanup ref access. |
| Sandbox limitation | Initial test/build attempts failed with `spawn EPERM`. Approved runs outside the sandbox passed; the initial failures are not product defects. |
| Backend suite | Not run in this review. Historical README counts are not fresh verification. |
| Browser/mobile/accessibility | Not run in this review. No claim of screenshot fidelity or end-to-end acceptance. |
| Live integrations | Clerk, signal providers, AI providers, database deployment and Neo4j were not exercised. |

Passing tests do not negate the source-confirmed gaps. Existing tests need acceptance coverage for the new routes and visible business results, including API rejection and empty-data cases.

## Recommended repair order

1. Restore authenticated identity and role handling; remove production demo fallbacks.
2. Connect new upload and pipeline screens to ingestion/context APIs.
3. Replace static candidates, scores and evidence across workspace, pool, profile and explorer with shared API-backed data.
4. Correct job wizard persistence and job-specific scoring; enforce unknown/unverified semantics.
5. Implement or clearly mark comparison, discovery, evidence requests and unfinished controls.
6. Run backend tests and browser acceptance at desktop/mobile widths: invalid login, role restriction, create/reload job, upload/retrieve candidate, processing failure/retry, switch-job ranking, evidence filtering/export, comparison selection and provider-unavailable states.

## Existing documentation caveat

`open issue.md` is a useful design backlog, but it is not a verified inventory: it states that audit persistence and graph integration are absent even though audit/database and graph API code exist; it also treats a new global endpoint or vector service as necessary without first checking whether existing APIs suffice. `PRD.md` has older phase-status statements that conflict with later README implementation notes. Use source and fresh checks for release decisions, and reconcile these documents after repairs.
