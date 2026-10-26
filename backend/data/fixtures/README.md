# Controlled candidate evidence fixtures

These six JSON files are synthetic test inputs, not verified candidate facts or live platform responses. They are not loaded by the seed loader or exposed by API routes.

Each file contains `candidate_id`, explicit synthetic `provenance`, a fixed `reference_date`, validated `evidence_records`, and an `expected` object containing per-record computed weights, total evidence score and label. Each record includes its own reference date. Source links use the reserved `example.test` domain, not invented live repositories.

The fixed reference date is 2026-10-26. Observation dates exercise recent, 6-18 month, 18-36 month, older and undated cases. Fixtures cover all five evidence labels; CAND-005 intentionally has no records to test the absence of public evidence. Absence does not imply lack of skill.

Scoring and context-builder tests read these records and expected values, inject fixture-backed fetchers, and never contact public services. The dedicated Playwright backend uses the same controlled inputs plus one clearly labeled synthetic LinkedIn observation for UI provenance checks. Calculate scores from the input records; do not copy expected outputs into the implementation. Live/cache retrieval and deterministic scoring are implemented separately from fixture injection.

Seed candidate JSON files separately contain `resume_text_stub`, a synthetic plain-text fallback of at least 200 characters. `CandidateDetail` preserves it. The parser uses it when the referenced file is absent and labels the result `stub`.
