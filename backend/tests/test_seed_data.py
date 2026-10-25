import json
from pathlib import Path
from backend.config import settings
from backend.models import Job, CandidateDetail, CandidateSummary


def test_seed_jobs_validity():
    jobs_dir = settings.DATA_DIR / "jobs"
    assert jobs_dir.exists(), f"Jobs directory does not exist: {jobs_dir}"
    job_files = list(jobs_dir.glob("*.json"))
    assert len(job_files) >= 5, f"Expected at least 5 job files, found {len(job_files)}"

    for job_file in job_files:
        with open(job_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        job = Job.model_validate(data)
        assert job.id.startswith("JOB-")
        assert len(job.title) > 0
        assert len(job.requirements) > 0
        assert len(job.requirements_preview) > 0


def test_seed_candidates_validity():
    candidates_dir = settings.DATA_DIR / "candidates"
    assert candidates_dir.exists(), f"Candidates directory does not exist: {candidates_dir}"
    candidate_files = list(candidates_dir.glob("*.json"))
    assert len(candidate_files) >= 6, f"Expected at least 6 candidate files, found {len(candidate_files)}"

    for cand_file in candidate_files:
        with open(cand_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        candidate = CandidateDetail.model_validate(data)
        assert candidate.id.startswith("CAND-")
        assert "@" in candidate.email
        assert len(candidate.top_skills) > 0
        if candidate.match_preview:
            assert 0.0 <= candidate.match_preview.fit_score <= 100.0
