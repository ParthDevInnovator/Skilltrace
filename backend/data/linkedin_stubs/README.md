# Synthetic LinkedIn fixture format

Live LinkedIn retrieval, scraping and OAuth integration are not implemented. The fetcher reads only local, optional JSON files named `{candidate_id}.json` in this directory. Missing, invalid or mismatched files return no records. No synthetic fixture is read from or written to the signal disk cache.

Example (synthetic, not a verified profile):

```json
{
  "candidate_id": "CAND-001",
  "profile_url": "https://linkedin.com/in/example-profile",
  "provenance": "synthetic \u2014 linkedin stub",
  "headline": "Python and FastAPI developer",
  "about": "Synthetic demonstration text about Python services.",
  "observation_date": "2026-01-26"
}
```

The JSON escape `\u2014` decodes to an em dash and matches the EvidenceProvenance enum. The profile URL and candidate ID must match the requested identity. `headline` and `about` are optional; at least one known skill mention is needed to produce observations. `observation_date` is optional; undated/future observations use the unknown-date multiplier. Candidate IDs must match `CAND-` followed by digits.

Each distinct recognized skill generates one record with base weight 1, an explicit reference date and the visible provenance `synthetic \u2014 linkedin stub`. Every observation also says Synthetic. These records must never be presented as live fetched data or used to infer claim verification.

No sample candidate fixture is enabled by default. Tests write isolated temporary fixtures, not production seed files.
