# Offline recruiter fixtures

These synthetic jobs and candidate profiles support backend regression tests and
the offline Playwright server. They were recovered from commit `82f6d20` because
the old tests depended on data removed from the production data directory.
Signal observations remain in `backend/data/fixtures`.

Production continues to start without bundled candidates or jobs. Tests explicitly
opt into these fixtures; they are not a production demo fallback.
