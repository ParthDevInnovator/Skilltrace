from backend.services.seed_loader import SeedLoader
from backend.models import JobFilterParams, CandidateFilterParams


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

    # Search by candidate ID
    by_id = loader.get_candidates(search="CAND-001")
    assert len(by_id) == 1
    assert by_id[0].full_name == "Alex Rivera"

    # Search by skill keyword in search bar
    by_skill_search = loader.get_candidates(search="Apache Kafka")
    assert len(by_skill_search) >= 1
    assert any(c.id == "CAND-001" for c in by_skill_search)

    # Filter by comma-separated skills
    multi_skill = loader.get_candidates(skill="Python, Go")
    assert len(multi_skill) >= 1
    assert any(c.id == "CAND-001" for c in multi_skill)

    # Filter using CandidateFilterParams model
    params_result = loader.get_candidates(CandidateFilterParams(search="Rivera", skill="Python"))
    assert len(params_result) == 1
    assert params_result[0].id == "CAND-001"


def test_seed_loader_get_candidate_detail():
    loader = SeedLoader()
    cand = loader.get_candidate("CAND-001")
    assert cand is not None
    assert cand.full_name == "Alex Rivera"
    assert cand.experience_years == 8.5
    assert cand.external_identifiers.github is not None

    # Test lowercase and whitespace lookup
    assert loader.get_candidate("cand-001") is not None
    assert loader.get_candidate("  CAND-001  ") is not None
