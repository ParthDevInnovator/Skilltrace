# Skitrace API and feature testing report

Date: 7 November 2026. Code baseline: `2ba2163`.

## What you can test now

**Ready for local testing:** authenticated identity, job creation/list/search/detail,
resume ingestion, candidate search/detail, processing status, resume text, evidence
context, requirement extraction, job-specific ranking, individual JD matching and
similar requisitions. Comparison and evidence export reuse these APIs in the UI.

**Configuration-dependent:** AI chat, briefs, interview questions, knowledge graph,
OAuth and Clerk. Their application contracts are tested with controlled fixtures;
that does not establish that your live accounts, keys or services are operational.

**Not implemented:** semantic talent discovery, batch ingestion, evidence-request
delivery, notifications and settings. No API should be expected for these controls.

Fresh verification for this report: **356 backend tests passed in 6.24 seconds**.
The repair pass also verified 67 frontend tests and 14 desktop/mobile browser
scenarios. Those browser checks were not rerun for this documentation-only change.
No live provider requests, user registrations or data deletions were made for this report.

## Start the app and choose authentication

From the repository root:

```powershell
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- Route/schema reference: `http://localhost:8000/docs`
- OpenAPI JSON: `http://localhost:8000/openapi.json`
- Health: `http://localhost:8000/health`

Normal startup has no bundled sample candidates/jobs. Create a job and upload a
resume first. Use the actual IDs returned by your requests; do not assume
`CAND-001` or `JOB-001` exists.

There are two authentication modes:

1. **Native server authentication:** when Clerk is not configured, register a local
   recruiter, then log in using the JSON API examples below.
2. **Clerk authentication:** when the backend has `CLERK_SECRET_KEY`, protected
   requests require a valid Clerk session token. Sign in through the configured UI
   and copy the bearer token from a successful API request in browser DevTools.
   Set `$headers = @{ Authorization = 'Bearer YOUR_CLERK_SESSION_TOKEN' }` for the
   examples. Native JWT login is not a replacement for a Clerk token in this mode.

All protected requests use `Authorization: Bearer <token>`. Never put backend
secrets into the frontend. The example passwords/accounts below are yours to
create; there is no default production recruiter/admin login.

The Swagger UI uses an OAuth2 password security scheme, while native login accepts
JSON. Its automatic Authorize flow may not match this login contract; the
PowerShell requests below let you supply the bearer header directly.

## Endpoint inventory

Paths below use the canonical `/api/v1` routes unless an exception is shown.

Roles: **R** = recruiter, **M** = hiring manager, **A** = HR administrator.
An administrator can use recruiter and manager routes. Role requirements below
come from the actual endpoint dependencies, not just the separate permission table.

### Core APIs — automated contracts passing

| Method and path | Role | Feature / input | Expected success and things to inspect |
| --- | --- | --- | --- |
| `GET /` | Public | Root welcome | 200, product name/version and links. |
| `GET /health` | Public | Service and runtime record counts | 200, `status: ok`, `record_counts`. `/api/v1/health` is also available. Does not certify AI/Neo4j availability. |
| `POST /api/v1/auth/register` | Public | JSON: `email`, `password` (8–128 characters), `full_name` (2–255) | 201, new user with recruiter role. Duplicate email: 409. Does not create an admin. |
| `POST /api/v1/auth/login` | Public | JSON: `email`, `password` | 200, native `access_token`, `refresh_token`, expiry. Bad password: 401. |
| `GET /api/v1/auth/me` | Authenticated | Bearer token | 200, verified `user_id`, email, name, roles. Use this to check your identity before other tests. |
| `POST /api/v1/auth/refresh` | Native refresh token | JSON: `refresh_token`, or `{}` with the refresh cookie | 200, new native access token. Invalid/expired token: 401. |
| `POST /api/v1/auth/logout` | Native authenticated session | No body | 204, access token revoked and refresh cookie cleared. Clerk UI sign-out uses Clerk instead. |
| `GET /api/v1/jobs` | R/M/A | Optional query: `search`, `department`, `location` | 200, job array. Empty array is valid on a fresh installation. |
| `POST /api/v1/jobs` | R/A | JSON: `title`, `department`, `location`, `description_raw`; optional `requirements` | 201, persisted job including generated ID and structured requirements. |
| `GET /api/v1/jobs/{job_id}` | R/M/A | Actual job ID | 200, description, metadata and requirements; unknown ID: 404. |
| `POST /api/v1/ingest/resume` | R/A | Multipart `file`; optional `full_name`, `email`, `headline`, `location` corrections | 202, `candidate_id`, `status: building`, revision, parse source and duplicate-update flag. Poll context next. |
| `GET /api/v1/candidates` | R/M/A | Optional query: `search`, `skill`, `include_synthetic` | 200, summaries. Comma-separated skills intersect. Manager list/detail serialization masks email/location. |
| `GET /api/v1/candidates/resolve` | R/M/A | Query `name` and/or `email`; at least one nonblank value | 200, matching candidates. Empty query: 422. Name uses substring matching; email is trimmed/case-insensitive exact matching. |
| `GET /api/v1/candidates/{candidate_id}` | R/M/A | Returned candidate ID | 200, candidate details. Unknown ID: 404. |
| `GET /api/v1/candidates/{candidate_id}/context` | R/A | Candidate ID | 202 while building; 200 with claims, attributed evidence, raw score, tier and history when ready; 503 for failed build. |
| `GET /api/v1/candidates/{candidate_id}/resume` | R/M/A | Candidate ID | 200, `raw_text`, `source`, `char_count`; 204 if no text. This returns extracted text, not original file bytes. |
| `POST /api/v1/jd/extract` | R/A | JSON: `job_id` OR `jd_text` of at least 50 characters | 200, typed requirement array. Existing structured requirements take precedence over text. |
| `POST /api/v1/jd/rank` | R/A | JSON: `job_id`; optional ISO `reference_date` | 200, ranked candidates with scores, requirement coverage and `context_status`. Building/failed rows are not assessed. |
| `POST /api/v1/candidates/{candidate_id}/jd-match` | R/A | JSON: `job_id`; optional `reference_date` | 200, role-specific scores and claim/evidence IDs supporting coverage; 202 building; 503 failed. |
| `POST /api/v1/jd/similar` | R/A | JSON: `job_id`; optional `reference_date` accepted by shared model | 200, similar jobs with overlapping requirements. An empty array is valid if no other roles overlap. |

Job creation API minimums are title/department/location: 2 characters each;
description: 10 characters. The frontend wizard intentionally requires a
description of at least 50 characters for extraction. A structured requirement
contains `id`, `requirement_text`, optional `category`, and `is_mandatory`.
The server assigns final IDs unique to the created job.

### APIs that need external configuration

| Method and path | Role | Request | Configuration and expected behavior |
| --- | --- | --- | --- |
| `POST /api/v1/agent/chat` | R/M/A | `{"message":"Tell me about CAND-ID","history":[],"job_id":"JOB-ID"}`; job optional | Gemini and/or Groq credentials. 200 includes `assistant_message`, `provider_used`, `grounding_ids`. Provider failure: 503. Inspect returned content/status as well as HTTP status for pending tool results. |
| `POST /api/v1/candidates/{candidate_id}/brief` | R/A | `{"job_id":"JOB-ID"}`; job and reference date optional | Ready context and AI provider. 200 includes strengths, evidence summary, history notes, gaps, grounding IDs and provider. 202 building; 503 context/provider failure. |
| `POST /api/v1/candidates/{candidate_id}/interview-questions` | R/M/A | `{"job_id":"JOB-ID"}`; optional reference date | Ready context and AI provider. 200 includes `questions`, target types, rationales and source IDs. 202 building; 503 failure. |
| `GET /api/v1/candidates/{candidate_id}/graph` | R/M/A | No body | Neo4j configuration and graph data. 200, nodes/edges. Unconfigured/unavailable graph: 503. A healthy empty graph is not a provider failure. |
| `POST /api/v1/candidates/{candidate_id}/graph-evidence` | R/M/A | `{"skill":"Python"}` | Neo4j. 200, linked graph nodes; 503 unavailable. |
| `GET /api/v1/auth/oauth/authorize` | Public | No body | Configured Google/GitHub OAuth client and redirect URI. Redirects to provider; 404 if not configured, 503 incomplete config, 501 for Clerk mode. |
| `GET /api/v1/auth/oauth/callback` | Public | Provider-generated `code`, `state` query parameters | Completes configured OAuth exchange; returns native tokens. Invalid state: 400. Do not manufacture a callback URL manually. |

AI settings: `GEMINI_API_KEY`, `GROQ_API_KEY`. Graph settings: `NEO4J_URI`,
`NEO4J_USER`, `NEO4J_PASSWORD`; `GRAPH_SEEDING_ENABLED=true` enables context-to-graph
writes. Set these before starting the backend. Adding graph settings alone does
not guarantee there is candidate graph data.

GitHub/LeetCode observations are fetched during context building using profile
identifiers found in the resume. They have no separate public “fetch signals” API.
LinkedIn currently uses synthetic local fixtures, not live retrieval. No external
signal still permits a ready context with `No public evidence`.

### Administration — test with an actual admin identity

| Method and exact path | Requirement | Behavior |
| --- | --- | --- |
| `GET /api/v1/admin/audit-logs` | A | 200, audit rows. Filters: `user_id`, `candidate_id`, `action_type`, `date_from`, `date_to`, `page` (default 1), `page_size` (default 50, max 200). |
| `DELETE /api/v1/candidates/{candidate_id}` | A | 204 for a persisted candidate and associated database records; 404 absent DB row; 500 rolls back deletion. Uploaded runtime-only candidates are not guaranteed to have the required DB row. Use disposable persisted test data. |
| `POST /seed/rebuild` | A plus `X-Admin-Key` matching configured `ADMIN_KEY` | Deliberately disabled with 403 when no key is configured. Missing/wrong key: 401. Successful rebuild returns repository stats. This is the exact unversioned path; it resets runtime state. |

Native registration cannot assign roles. Use an existing admin-managed account for
admin/manager testing. The offline browser server alone provisions test accounts;
those credentials are not a normal application login contract.

## Copy/paste PowerShell walkthrough

Run requests below against your local development server. Native registration/login
is only needed in native-auth mode; for Clerk, establish `$headers` as described
above and begin at step 2.

### 1. Native registration, login and identity

```powershell
$base = 'http://localhost:8000'
Invoke-RestMethod "$base/health"

$email = "api-test-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())@example.com"
$securePassword = Read-Host 'Choose a local test password (8+ characters)' -AsSecureString
$password = [System.Net.NetworkCredential]::new('', $securePassword).Password
$registration = @{ email=$email; password=$password; full_name='API Test Recruiter' } | ConvertTo-Json
Invoke-RestMethod "$base/api/v1/auth/register" -Method Post -ContentType 'application/json' -Body $registration

$loginBody = @{ email=$email; password=$password } | ConvertTo-Json
$session = Invoke-RestMethod "$base/api/v1/auth/login" -Method Post -ContentType 'application/json' -Body $loginBody
$headers = @{ Authorization="Bearer $($session.access_token)" }
Invoke-RestMethod "$base/api/v1/auth/me" -Headers $headers
```

Expected: identity has `roles: ["recruiter"]`. Keep tokens private.

### 2. Create and retrieve a real job

```powershell
$base = 'http://localhost:8000'
$jobBody = @{
  title='API Test Backend Engineer'
  department='Engineering'
  location='Pune'
  description_raw='Build reliable Python and FastAPI services with PostgreSQL. Docker experience is preferred.'
} | ConvertTo-Json
$job = Invoke-RestMethod "$base/api/v1/jobs" -Method Post -Headers $headers -ContentType 'application/json' -Body $jobBody
$jobId = $job.id
Invoke-RestMethod "$base/api/v1/jobs/$jobId" -Headers $headers
Invoke-RestMethod "$base/api/v1/jobs?search=API%20Test" -Headers $headers
```

Expected: a `CUSTOM-...` job ID and extracted requirements. Refresh the UI or
restart the backend and retrieve the job again to check persistence.

### 3. Upload a resume and keep its returned ID

```powershell
$resumeFile = Join-Path $env:TEMP 'skitrace-api-test-resume.txt'
@'
Name: API Test Candidate
Email: api-test-candidate@example.com
Title: Python Backend Engineer
Location: Pune
Experience: 5 years building Python and FastAPI services with PostgreSQL.
Built reliable asynchronous APIs and maintained Docker deployments.
'@ | Set-Content -LiteralPath $resumeFile -Encoding UTF8

$uploadJson = curl.exe --silent --show-error -X POST "$base/api/v1/ingest/resume" `
  -H "Authorization: $($headers.Authorization)" `
  -F "file=@$resumeFile" -F 'full_name=API Test Candidate' -F 'email=api-test-candidate@example.com'
$upload = $uploadJson | ConvertFrom-Json
$upload
if (-not $upload.candidate_id) { throw 'Upload failed; inspect the response above.' }
$candidateId = $upload.candidate_id
```

Expected: 202 with candidate ID and `building`. Re-uploading the same email updates
the candidate (`updated_existing: true`) rather than necessarily creating another.
Valid formats: PDF/DOCX/TXT, nonempty and at most 5 MB. Missing extracted identity
needs valid name/email corrections. Unsupported files: 422; oversized: 413.
Scanned PDFs require readable text; OCR is not provided.

### 4. Follow processing, inspect evidence and original extracted text

```powershell
$context = $null
for ($i = 0; $i -lt 10; $i++) {
  $context = Invoke-RestMethod "$base/api/v1/candidates/$candidateId/context" -Headers $headers
  if ($context.status -ne 'building') { break }
  Start-Sleep -Seconds 3
}
if ($context.status -eq 'building') {
  Write-Host 'Still processing. Retry the context request later.'
} else {
  $context | Select-Object evidence_score, evidence_label, parse_source
  $context.claims | Format-Table claim_text, verification_state
  $context.evidence_records | Format-Table source_type, skill, provenance
}
Invoke-RestMethod "$base/api/v1/candidates/$candidateId" -Headers $headers
Invoke-RestMethod "$base/api/v1/candidates/$candidateId/resume" -Headers $headers
Invoke-RestMethod "$base/api/v1/candidates?search=API%20Test" -Headers $headers
```

A 503 raises a PowerShell request error: inspect the response detail rather than
treating it as a completed build. This sample contains no external profiles, so
zero evidence is valid. Public evidence is not automatic claim verification.

### 5. Extract requirements, rank and inspect this candidate's match

```powershell
$matchBody = @{ job_id=$jobId; reference_date='2026-11-07' } | ConvertTo-Json
Invoke-RestMethod "$base/api/v1/jd/extract" -Method Post -Headers $headers -ContentType 'application/json' -Body $matchBody
$ranking = Invoke-RestMethod "$base/api/v1/jd/rank" -Method Post -Headers $headers -ContentType 'application/json' -Body $matchBody
$ranking | Format-Table candidate_id, full_name, resume_fit, evidence_strength, final_score, context_status
$match = Invoke-RestMethod "$base/api/v1/candidates/$candidateId/jd-match" -Method Post -Headers $headers -ContentType 'application/json' -Body $matchBody
$match.coverage | Format-Table requirement_id, coverage_state, observation
Invoke-RestMethod "$base/api/v1/jd/similar" -Method Post -Headers $headers -ContentType 'application/json' -Body $matchBody
```

Ready match scores range from 0 to 1; multiply by 100 for UI percentages.
`final_score = 0.5 * resume_fit + 0.5 * evidence_strength`. The context's raw
`evidence_score` is a separate points measure, not a percentage. Always inspect
`context_status`; zero while building/failed is not a completed negative assessment.
Use the same reference date for repeatable scoring. Create a second, different job
and repeat with its ID to verify role-specific coverage.

### 6. Try AI/graph only after configuring those services

```powershell
Invoke-RestMethod "$base/api/v1/candidates/$candidateId/brief" -Method Post -Headers $headers -ContentType 'application/json' -Body $matchBody
Invoke-RestMethod "$base/api/v1/candidates/$candidateId/interview-questions" -Method Post -Headers $headers -ContentType 'application/json' -Body $matchBody
$chatBody = @{ message="What remains unverified about $candidateId?"; history=@(); job_id=$jobId } | ConvertTo-Json -Depth 5
Invoke-RestMethod "$base/api/v1/agent/chat" -Method Post -Headers $headers -ContentType 'application/json' -Body $chatBody
Invoke-RestMethod "$base/api/v1/candidates/$candidateId/graph" -Headers $headers
$skillBody = @{ skill='Python' } | ConvertTo-Json
Invoke-RestMethod "$base/api/v1/candidates/$candidateId/graph-evidence" -Method Post -Headers $headers -ContentType 'application/json' -Body $skillBody
```

Expected without configuration: explicit unavailable/error behavior, not invented
content. A brief/question request may need retrying after a 202 building response.

## UI feature checklist

| Screen/control | Underlying API or behavior | Manual pass condition |
| --- | --- | --- |
| Sign-in and reload | Auth token + `/auth/me` | Correct identity/role; incorrect password never opens a demo session. |
| Create Job | `/jobs`, `/jd/extract` | Saved role and mandatory/preferred requirements reappear on reload. Extra wizard metadata is retained in description text. |
| Jobs search/department filter | `/jobs`, local filtering | Only actual saved jobs; no invented lifecycle counts. |
| Add Candidates | `/ingest/resume` | Actual file bytes submitted; returned candidate ID used. |
| Pipeline | `/{id}/context` | Building/ready/error reflects server state; returning to a job does not claim cancellation. |
| Talent Pool | `/candidates?search=...&skill=...` | Uploaded candidate is searchable; filters change the actual result set. |
| Rank by fit / JD Match | `/jd/rank`, `/{id}/jd-match` | Changing jobs clears old ranking; new scores/coverage correspond to the new job. |
| Evidence Explorer | `/candidates`, each `/{id}/context` | Search/platform/skill/tier/score filters affect displayed observations. Exported JSON contains the currently filtered records. |
| Comparison | Repeated `/{id}/jd-match` calls | Up to three real selections; removing one changes columns; no fixed Maya/Jonas scores. |
| Resume Reference | `/{id}/resume` | Shows uploaded text or explicit empty/error state. |
| Export brief | Brief API + browser TXT download | Download matches selected candidate. This is not a full PDF dossier export. |
| Graph | `/{id}/graph`, `/{id}/graph-evidence` | Real nodes/relationships or explicit unavailable message. |

There is **no separate global evidence endpoint, comparison endpoint, discovery
search endpoint or server report-download endpoint** in the current implementation.
Evidence filtering/export, comparison composition and brief downloads happen in
the frontend using the APIs above.

## Negative tests and known limits

- Protected route without bearer token: 401. Valid manager token on rank/upload/
  brief/raw-context routes: 403. Unknown candidate/job: 404. Invalid body: 422.
- Manager candidate list/detail masks email and location. The identity-resolution
  endpoint and raw resume endpoint do not provide the same masking guarantee;
  do not interpret the role checks as proof of complete PII protection.
- Invalid login must leave the UI signed out. Native logout should make the old
  access token fail `/auth/me`; it is not the Clerk sign-out endpoint.
- Context status uses 202 while building and 503 when failed. Refetching status
  retries retrieval; it does not force a rebuild of a terminally failed context.
- Candidates, uploaded resume/context state and match caches remain process-local.
  Candidate data can disappear on backend restart. Jobs are persisted and restored.
- Do not use seed rebuild during an upload test: it resets runtime repository state.
- Admin deletion is database-backed and is not guaranteed to delete every
  process-local artifact/cache for an uploaded candidate. It is not a complete
  production-erasure certification.
- Live API availability depends on your running server and configuration. This
  report establishes code paths and automated contracts, not a deployment health SLA.

## Repeat the automated checks

```powershell
.\.venv\Scripts\python.exe -c "import os,pytest; os.environ['DEBUG']='false'; raise SystemExit(pytest.main(['backend/tests','-q','-p','no:cacheprovider']))"
npm --prefix frontend run test:e2e:repair
```

Backend tests use an isolated database. The browser repair suite uses its own
offline servers on ports 5181/8011 and synthetic adapters; those are verification
services, not your normal live-provider application. Additional implementation
limits are recorded in [REDESIGN_REPAIR_STATUS.md](REDESIGN_REPAIR_STATUS.md).
