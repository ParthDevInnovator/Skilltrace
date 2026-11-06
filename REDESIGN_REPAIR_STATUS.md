# Redesign repair status

Updated: 7 November 2026.

## Implemented

- Restored server login routes and verified session identity. Rejected credentials or failed identity lookup no longer grant demo/admin access. Native sessions are checked on reload. Configured Clerk sessions use Clerk tokens and obtain application roles from the server. Inactive Clerk users are rejected. Known browser-test accounts can be created only in the `e2e` environment.
- Connected Add Candidates to multipart ingestion and the returned candidate ID. Pipeline polls actual context status and exposes ready/error/retry states. Returning to a job explicitly leaves processing running. Batch upload is marked unavailable.
- Replaced mock candidates, fit scores, progress, counters, evidence exports and graph decorations with API-backed content. Talent Pool and job workspace reuse candidate filtering, ranking and upload components. Profile loading no longer invents another candidate; missing experience/identity/evidence stays unknown.
- Corrected wizard validation and removed default role content. Extraction uses the submitted description at save time. Mandatory/preferred skills are persisted as structured requirements; employment type, experience range and hiring manager are explicitly preserved in the description. Requirement IDs are unique per job. Persisted custom jobs are restored into the matching repository at server startup.
- Implemented comparison of up to three actual candidates using selected-job match responses. Loading/failed assessments remain explicit. Discovery and evidence requests are marked unavailable; notifications and settings are disabled. Export is named “Export brief” to describe its scope.
- Fixed mobile navigation/header layout, job-picker availability, wizard scrolling/focus handling and muted-text contrast. The carbon/champagne palette, navigation shell, candidate cards and dossier tabs remain; mock-only panels were simplified around real data.
- Restored the seed-rebuild endpoint required by existing API contracts. It requires HR-admin authorization and the configured admin key; browser tests leave it disabled.

## Verification

| Check | Result |
| --- | --- |
| Backend pytest suite | 356 passed, including cold-repository job/requirement restoration and cross-job requirement ID collision checks. |
| Frontend Vitest | 67 passed, including rejected-credential and failed-identity login checks. |
| Redesign Playwright acceptance | 14 passed: seven scenarios each at desktop and 390 × 844 mobile widths, using installed Edge. |
| TypeScript and production build | Passed. |
| Lint | Passed; one pre-existing warning in `e2e/phase5.spec.ts`. |

Browser acceptance covers invalid login, redirect, sign-out/reload, manager
restrictions, wizard save/reload, real resume bytes and returned identity,
processing failure/retry, different-job ranking, comparison selection, evidence
filtering/export and provider-unavailable states. Axe checks the final discovery
view at both widths; this is not an accessibility certification of every screen.

Browser tests run isolated servers on ports 5181/8011 and a separate ignored
database. Backend tests use explicit synthetic fixtures and reinstall an isolated
database dependency for each test. Production seed data remains disabled.
Original phase browser specs were not run for this sign-off; they still target
portions of the earlier interface/auth contract.

```powershell
.\.venv\Scripts\python.exe -c "import os,pytest; os.environ['DEBUG']='false'; raise SystemExit(pytest.main(['backend/tests','-q','-p','no:cacheprovider']))"
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run lint
npm --prefix frontend run test:e2e:repair
```

## Remaining limits

- Live Clerk, signal services, AI providers and Neo4j were not exercised. Browser tests use controlled offline adapters; deployment configuration still needs a live smoke test.
- Native access tokens that expire while the app is closed currently require signing in again on reload; the existing explicit refresh action remains in the auth provider.
- Uploaded candidate/context state retains the existing in-memory lifecycle and does not survive a backend restart. This work verifies job persistence, not complete candidate persistence.
- Processing retry refetches status after a transient retrieval failure. A terminal build failure can require correcting/re-uploading the resume; no arbitrary candidate-rebuild permission was added.
- Comparison selection lasts while its screen is mounted. Cross-screen/session selection persistence is not implemented.
- Employment, manager and experience fields are preserved in JD text, rather than new database columns or independently interpreted matching criteria.
- Natural-language discovery, batch upload, evidence-request delivery, notifications and settings remain unavailable and are labelled accordingly.

`PRODUCT_DESIGN_AUDIT.md` records pre-repair findings; this file records the repairs
and verification limits.
