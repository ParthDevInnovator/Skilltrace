# Open Issues & Feature Gaps: Design Rebuild vs Current Codebase

This document tracks all features and functionalities depicted across all 15 redesign mockups (Batch 1, Batch 2 & Batch 3) that are not currently implemented or only partially supported in the Skitrace backend/frontend codebase.

---

## 1. Authentication & SSO (`LoginPage.tsx`)
- [ ] **Passwordless Work Email Magic Link Flow**: The UI features `Work email` with `Continue with email`. Current backend only provides standard username/password authentication (`/api/v1/auth/login`) or Clerk authentication. Magic link token dispatch, transactional email service integration, and token verification endpoints are not implemented.
- [ ] **Social / Enterprise SSO**: The UI displays direct single-click `Google` and `Microsoft` SSO buttons. Direct OAuth 2.0 / SAML identity provider flows for Google and Azure AD / Microsoft are not connected to backend user provisioning.
- [ ] **SOC 2 Compliance & Terms of Service Footnote**: UI displays a compliance badge (`SOC 2 Type II certified`). Legal links (`Terms` and `Privacy Policy`) need static routes or external URLs.

---

## 2. Requisition Schema & Multi-Step Creation Wizard (`CustomJDModal.tsx`)
- [ ] **Extended Job Table Schema**: Step 1 collects:
  - `Employment type` (e.g. Full-time, Contract, Hybrid)
  - `Experience range` (e.g. 3-6 years)
  - `Hiring manager` (e.g. Elena Marsh)
  - `Preferred skills` separate from mandatory skills
  Currently, SQLite `jobs` table schema (`backend/models.py`) only has: `id`, `title`, `description_raw`, `department`, `location`, `created_at`. These extra attributes are currently packed into the description text or handled in-memory. A database migration is needed to add dedicated columns.
- [ ] **Multi-Step Stepper Navigation**: The UI defines a 3-step creation flow: `1 Role` -> `2 Requirements` -> `3 Candidates`.
- [ ] **AI-Assisted Experience & Work Permit Parsing**: Step 2 structured requirement card highlights automated extraction of `Experience` (e.g., "3-6 years backend · Async systems") and legal requisites (e.g., "+ EU work permit · English C1"). The current extraction endpoint (`/api/v1/matching/extract-requirements`) categorizes skills into `core` and `secondary` but does not yet separate years of experience or visa/work authorization into dedicated fields.

---

## 3. Recruiter Dashboard & Live Intelligence Telemetry (`DashboardOverview.tsx`)
- [ ] **Timeframe Aggregations**: The dashboard UI includes a timeframe picker (`Last 30 days`) with dynamic delta metrics (`+2 this month`, `+38 this week`, `79% coverage`, `Across 4 platforms`). Currently, the backend returns global counts without historical time-series deltas.
- [ ] **Live Recruiter Activity Feed (`Intelligence Activity`)**: The dark telemetry card displays platform events (e.g. "14 new GitHub evidence linked to Backend Engineer", "Batch analysis finished: 24 resumes in 6 min", "2 skill contradictions flagged for review"). Currently, there is no persistent audit log or event stream table in the backend.
- [ ] **Top Candidate Fit Indicators on Job Cards**: Recent Jobs and Job cards display pre-computed `92 top fit` and `88 top fit` score previews directly in the list. Current backend calculates fit dynamically when matching against loaded candidate dossiers.

---

## 4. Requisition Status & Processing Pipeline (`JobsView.tsx`)
- [ ] **Job Lifecycle Status**: The Jobs view features segmented filters: `All (6)`, `Active (4)`, `Draft (2)`. The database `Job` model currently lacks a `status` enum (`DRAFT`, `ACTIVE`, `ARCHIVED`, `CLOSED`).
- [ ] **Granular Resume Pipeline Counters**: Each job card displays a 3-part metric badge:
  - `Resumes Ingested`
  - `Analyzed`
  - `Processing`
  Current backend does not maintain an asynchronous background queue state (e.g. Celery / Redis queue) tracking in-flight resume parsing per job.
- [ ] **Advanced Requisition Filtering**: Top bar provides a dedicated `Filter` modal/popover (filtering by department, seniority, recruiter, location) beyond the simple text query input.

---

## 5. Candidate Intelligence Dossier & Evidence Split (`CandidateProfileShell.tsx`)
- [ ] **Export Intelligence Report**: The candidate profile displays `Export Report` for generating downloadable PDF / Markdown audit dossiers. The endpoint `/api/v1/agent/brief/download` exists for briefs but full composite dossiers (with GitHub/LeetCode verification cards) need unified rendering.
- [ ] **Automated "Request Evidence" Flow**: The Intelligence Gaps panel includes `Request Evidence` to prompt candidates for unverified skills (e.g., Kafka repos, private code samples). This requires candidate contact email dispatch and a secure submission portal.
- [ ] **Dynamic Contradiction Detection Engine**: The dossier highlights "0 open contradictions" and flagged inconsistencies between resume claims and external code commits. Current evidence scoring flags unverified claims but lacks an automated contradiction/conflict inference model.

---

## 6. Multi-Candidate Ingestion & Batch Queue (`AddCandidatesView.tsx`)
- [ ] **Multi-File Batch Queue Orchestrator**: The `Add Candidates` view allows dragging multiple PDFs (`4 files queued`), displaying concurrent progress bars and queuing. Currently, `/api/v1/matching/upload-resume` processes files individually and synchronously. An asynchronous batch ingestion worker is required.
- [ ] **Resume Parsing Metadata Extraction**: Displays `1.8 MB · 2 pages · Parsed`. Full document metadata extraction (page count, embedded text layers, OCR confidence) is not currently returned by the upload endpoint.

---

## 7. 8-Stage Real-Time Pipeline Visualizer (`PipelineAnalysisView.tsx`)
- [ ] **8-Stage Live Event Stream**: The live analysis screen illustrates an 8-stage pipeline:
  1. Resume Extraction
  2. Candidate Identification
  3. GitHub Discovery
  4. LinkedIn Discovery
  5. LeetCode Discovery
  6. Project Analysis
  7. Skill Verification
  8. Job Matching
  Currently, evidence scoring runs synchronously in a single deterministic Python pipeline rather than exposing Server-Sent Events (SSE) / WebSocket status for each sub-stage.
- [ ] **Dynamic Document Split Preview**: The left split preview renders a live formatted preview of the uploaded PDF alongside extraction highlights. A PDF canvas rendering layer (e.g. `pdf.js` or pre-rendered thumbnail service) is needed for arbitrary user-uploaded files.

---

## 8. Candidate Intelligence Directory & Requisition Workspace (`JobDetailWorkspace.tsx`)
- [ ] **Requisition Sub-Tabs State & Routes**: The requisition workspace features sub-navigation (`Overview`, `Candidates`, `Requirements`, `Comparison`, `Activity`). Deep links (e.g. `/jobs/:id/candidates`, `/jobs/:id/comparison`) need persistent router routes.
- [ ] **Multi-Filter Faceting**: The Candidate Intelligence table includes composite filter pills:
  - `Job Fit: All / >80 / >90`
  - `Skills: Python / FastAPI / ...`
  - `Evidence: 70%+ / 80%+`
  - `Status: All / Analyzed / Needs Review / Processing`
  - `Source: All platforms / GitHub / LinkedIn / LeetCode`
  Current backend search endpoint accepts `search` and `skill` query params; additional filtering is currently applied on the client.

---

## 9. Candidate Side-by-Side Comparison Matrix (`CandidateComparisonView.tsx`)
- [ ] **Multi-Candidate Comparative Evidence Endpoint**: The comparison view supports comparing 2 to 3 candidates simultaneously across Job Fit, Mandatory Skills, Evidence Coverage, granular skills (Python, FastAPI, Postgres, Redis, Kafka), Top Project, and Experience. Current backend provides individual match results via `/api/v1/matching/candidate-jd-match` but lacks a dedicated multi-candidate diffing endpoint `/api/v1/matching/compare` that computes delta highlights automatically.
- [ ] **Candidate Comparison Slot Management**: Persistent session or URL state for dynamically adding/removing candidate comparison slots (up to 3 candidates).

---

## 10. Interactive Knowledge Graph & Cypher Exploration (`GraphVisualization.tsx`)
- [ ] **Full Knowledge Graph Neo4j Backend Integration**: The UI features interactive switching between `Candidates + Skills`, `Projects`, and `Sources`, with 18 nodes and 34 verified edges. Current implementation provides stub data or an unavailable state if Neo4j is offline. A live Neo4j Cypher query pipeline (`/api/v1/graph/explore`) with sub-graph expansion by node category is required.
- [ ] **Source Platform Node Metadata**: Displaying live links to external profiles directly on graph nodes (e.g., GitHub repo counts, LeetCode ranking, LinkedIn employment history).

---

## 11. Global Evidence Explorer & Platform Audit (`EvidenceExplorer.tsx`)
- [ ] **Global Evidence Audit Ledger Endpoint**: Displays 1,240 cross-platform evidence items across candidates with full-text search (`Search evidence — "Redis retry queues"...`), filter pills (`Verified only`, `Platform`, `Skill`). Current backend endpoint `/api/v1/evidence/` operates per candidate; a global indexed search endpoint across all candidate evidence records is needed.
- [ ] **Bulk Evidence Export**: Top action `Export` triggers a full platform dump of verified evidence records into CSV/JSON format.

---

## 12. Talent Pool Intelligence Library (`TalentPoolView.tsx`)
- [ ] **Organization-Wide Talent Pool Faceting**: Provides a global searchable library of candidate profiles independent of a single job opening (`248 profiles · Updated hourly`). A dedicated talent pool search and aggregation endpoint `/api/v1/talent-pool/search` is needed to support cross-role discovery.
- [ ] **Scheduled Profile Refresh Worker**: Telemetry shows `Updated hourly`. An automated background sync service to periodically re-crawl public repositories, commit streaks, and verified evidence sources is required.

---

## 13. Natural-Language Proof Discovery (`TalentDiscoveryView.tsx`)
- [ ] **Semantic RAG Proof Search Engine**: Top natural-language query panel (`Find candidates with demonstrated Python, FastAPI and PostgreSQL experience, with production async work`) with filters (`Evidence 80%+`, `Backend · Remote`). The backend currently relies on keyword/skill matching. A semantic vector search service (e.g. pgvector / Qdrant) combined with an LLM re-ranking pipeline is required to produce custom `Why they match` justification strings.
