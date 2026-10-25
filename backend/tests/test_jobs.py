import pytest
from httpx import AsyncClient, ASGITransport
from backend.main import app


@pytest.mark.asyncio
async def test_get_jobs_list():
    """Test GET /api/v1/jobs returns seeded jobs array."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/jobs")
        assert response.status_code == 200
        jobs = response.json()
        assert isinstance(jobs, list)
        assert len(jobs) >= 5

        # Check fields of first job
        first = jobs[0]
        assert "id" in first
        assert "title" in first
        assert "department" in first
        assert "location" in first
        assert "description_raw" in first
        assert "requirements_preview" in first


@pytest.mark.asyncio
async def test_get_jobs_search_filter():
    """Test GET /api/v1/jobs with keyword search."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/jobs?search=distributed")
        assert response.status_code == 200
        jobs = response.json()
        assert len(jobs) >= 1
        assert any(j["id"] == "JOB-001" for j in jobs)


@pytest.mark.asyncio
async def test_get_jobs_department_filter():
    """Test GET /api/v1/jobs with department filter."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/jobs?department=Engineering")
        assert response.status_code == 200
        jobs = response.json()
        assert len(jobs) >= 1
        assert all("engineering" in j["department"].lower() for j in jobs)


@pytest.mark.asyncio
async def test_get_jobs_location_filter():
    """Test GET /api/v1/jobs with location filter."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/jobs?location=Remote")
        assert response.status_code == 200
        jobs = response.json()
        assert len(jobs) >= 1
        assert all("remote" in j["location"].lower() for j in jobs)


@pytest.mark.asyncio
async def test_get_job_by_id_success():
    """Test GET /api/v1/jobs/{id} returns job details."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/jobs/JOB-001")
        assert response.status_code == 200
        job = response.json()
        assert job["id"] == "JOB-001"
        assert "Distributed Systems" in job["title"]
        assert len(job["requirements"]) > 0


@pytest.mark.asyncio
async def test_get_job_by_id_case_insensitive():
    """Test GET /api/v1/jobs/{id} handles case-insensitive IDs and whitespace."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/jobs/job-001")
        assert response.status_code == 200
        assert response.json()["id"] == "JOB-001"


@pytest.mark.asyncio
async def test_get_job_by_id_not_found():
    """Test GET /api/v1/jobs/{id} returns 404 for unknown job ID."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/jobs/JOB-UNKNOWN")
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        assert "JOB-UNKNOWN" in data["detail"]


@pytest.mark.asyncio
async def test_get_jobs_prd_prefix():
    """Test GET /jobs alias endpoint mounted for PRD compatibility."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/jobs")
        assert response.status_code == 200
        assert len(response.json()) >= 5

        detail = await client.get("/jobs/JOB-001")
        assert detail.status_code == 200
        assert detail.json()["id"] == "JOB-001"
