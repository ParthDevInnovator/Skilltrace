from backend.services.seed_loader import SeedLoader
from backend.models import JobFilterParams


def test_seed_loader_initial_load():
    loader = SeedLoader()
    loader.load_all()
    stats = loader.stats()
    assert stats["total_jobs"] >= 5
    assert stats["total_candidates"] >= 6


def test_seed_loader_get_jobs_unfiltered():
    loader = SeedLoader()
    jobs = loader.get_jobs()
    assert len(jobs) >= 5


def test_seed_loader_job_search_filter():
    loader = SeedLoader()
    # Search by keyword
    results = loader.get_jobs(JobFilterParams(search="distributed"))
    assert len(results) >= 1
    assert any(j.id == "JOB-001" for j in results)

    # Search by department
    results_dept = loader.get_jobs(JobFilterParams(department="Product"))
    assert len(results_dept) >= 1
    assert any(j.id == "JOB-002" for j in results_dept)

    # Search non-matching
    results_empty = loader.get_jobs(JobFilterParams(search="nonexistentxyzquery"))
    assert len(results_empty) == 0


def test_seed_loader_get_job_by_id():
    loader = SeedLoader()
    job = loader.get_job("JOB-001")
    assert job is not None
    assert job.id == "JOB-001"
    assert "Distributed Systems" in job.title

    missing_job = loader.get_job("JOB-999")
    assert missing_job is None


def test_seed_loader_get_candidates():
    loader = SeedLoader()
    candidates = loader.get_candidates()
    assert len(candidates) >= 6

    # Filter by skill
    react_cands = loader.get_candidates(skill="React")
    assert len(react_cands) >= 2
    cand_names = [c.full_name for c in react_cands]
    assert "Jordan Lee" in cand_names
    assert "Priya Sharma" in cand_names

    # Filter by name search
    alex = loader.get_candidates(search="Alex")
    assert len(alex) == 1
    assert alex[0].id == "CAND-001"


def test_seed_loader_get_candidate_detail():
    loader = SeedLoader()
    cand = loader.get_candidate("CAND-001")
    assert cand is not None
    assert cand.full_name == "Alex Rivera"
    assert cand.experience_years == 8.5
    assert cand.external_identifiers.github is not None
