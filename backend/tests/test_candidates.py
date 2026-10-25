import pytest
from httpx import AsyncClient, ASGITransport
from backend.main import app


@pytest.mark.asyncio
async def test_get_candidates_list():
    """Test GET /api/v1/candidates returns all seeded candidate summaries."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/candidates")
        assert response.status_code == 200
        candidates = response.json()
        assert isinstance(candidates, list)
        assert len(candidates) >= 6

        # Check fields of first candidate
        first = candidates[0]
        assert "id" in first
        assert "full_name" in first
        assert "email" in first
        assert "headline" in first
        assert "location" in first
        assert "top_skills" in first
        assert isinstance(first["top_skills"], list)


@pytest.mark.asyncio
async def test_get_candidates_search_filter():
    """Test GET /api/v1/candidates with search query."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/candidates?search=Alex")
        assert response.status_code == 200
        candidates = response.json()
        assert len(candidates) == 1
        assert candidates[0]["id"] == "CAND-001"
        assert candidates[0]["full_name"] == "Alex Rivera"


@pytest.mark.asyncio
async def test_get_candidates_skill_filter():
    """Test GET /api/v1/candidates with skill query."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/candidates?skill=React")
        assert response.status_code == 200
        candidates = response.json()
        assert len(candidates) >= 2
        names = [c["full_name"] for c in candidates]
        assert "Jordan Lee" in names
        assert "Priya Sharma" in names


@pytest.mark.asyncio
async def test_get_candidates_search_no_match():
    """Test GET /api/v1/candidates with search yielding no results."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/candidates?search=nonexistentcandidate12345")
        assert response.status_code == 200
        candidates = response.json()
        assert len(candidates) == 0


@pytest.mark.asyncio
async def test_get_candidates_search_by_id():
    """Test GET /api/v1/candidates allows searching directly by candidate ID."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/candidates?search=CAND-001")
        assert response.status_code == 200
        candidates = response.json()
        assert len(candidates) == 1
        assert candidates[0]["full_name"] == "Alex Rivera"


@pytest.mark.asyncio
async def test_get_candidates_search_by_skill_keyword():
    """Test GET /api/v1/candidates allows searching skills via search parameter."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/candidates?search=Apache+Kafka")
        assert response.status_code == 200
        candidates = response.json()
        assert len(candidates) >= 1
        assert any(c["id"] == "CAND-001" for c in candidates)


@pytest.mark.asyncio
async def test_get_candidates_comma_separated_skills():
    """Test GET /api/v1/candidates allows filtering by multiple comma-separated skills."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/candidates?skill=Python,%20Go")
        assert response.status_code == 200
        candidates = response.json()
        assert len(candidates) >= 1
        assert any(c["id"] == "CAND-001" for c in candidates)


@pytest.mark.asyncio
async def test_get_candidates_combined_filter():
    """Test GET /api/v1/candidates combining search and skill query parameters."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Match Rivera + Python
        response = await client.get("/api/v1/candidates?search=Rivera&skill=Python")
        assert response.status_code == 200
        candidates = response.json()
        assert len(candidates) == 1
        assert candidates[0]["id"] == "CAND-001"

        # Rivera + React (Rivera does not have React)
        mismatch_res = await client.get("/api/v1/candidates?search=Rivera&skill=React")
        assert mismatch_res.status_code == 200
        assert len(mismatch_res.json()) == 0


@pytest.mark.asyncio
async def test_get_candidate_by_id_success():
    """Test GET /api/v1/candidates/{id} returns full candidate detail."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/candidates/CAND-001")
        assert response.status_code == 200
        detail = response.json()
        assert detail["id"] == "CAND-001"
        assert detail["full_name"] == "Alex Rivera"
        assert detail["experience_years"] == 8.5
        assert "external_identifiers" in detail
        assert detail["external_identifiers"]["github"] is not None
        assert "claims_preview" in detail
        assert len(detail["claims_preview"]) > 0


@pytest.mark.asyncio
async def test_get_candidate_by_id_case_insensitive():
    """Test GET /api/v1/candidates/{id} resolves lowercase and whitespace-padded IDs."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Lowercase id
        response = await client.get("/api/v1/candidates/cand-001")
        assert response.status_code == 200
        assert response.json()["id"] == "CAND-001"

        # Whitespace padded id
        response_ws = await client.get("/api/v1/candidates/%20CAND-002%20")
        assert response_ws.status_code == 200
        assert response_ws.json()["id"] == "CAND-002"


@pytest.mark.asyncio
async def test_get_candidate_detail_with_null_identifiers():
    """Test candidate with partial external identifiers and 'No public evidence' label."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/candidates/CAND-006")
        assert response.status_code == 200
        detail = response.json()
        assert detail["id"] == "CAND-006"
        assert detail["external_identifiers"]["github"] is None
        assert detail["external_identifiers"]["leetcode"] is None
        assert detail["external_identifiers"]["linkedin"] is not None
        assert detail["match_preview"]["evidence_label"] == "No public evidence"


@pytest.mark.asyncio
async def test_get_candidate_by_id_not_found():
    """Test GET /api/v1/candidates/{id} returns 404 for unknown ID."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/candidates/CAND-UNKNOWN")
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        assert "CAND-UNKNOWN" in data["detail"]


@pytest.mark.asyncio
async def test_get_candidates_prd_prefix():
    """Test GET /candidates alias endpoint mounted for PRD compatibility."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/candidates")
        assert response.status_code == 200
        candidates = response.json()
        assert len(candidates) >= 6

        detail_response = await client.get("/candidates/CAND-001")
        assert detail_response.status_code == 200
        assert detail_response.json()["id"] == "CAND-001"
