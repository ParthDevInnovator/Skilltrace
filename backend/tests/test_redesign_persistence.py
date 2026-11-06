from types import SimpleNamespace
import httpx
import pytest
from backend.main import app
from backend.core.dependencies import get_current_user
from backend.core.database import get_db
from backend.routers.ingest import get_context_builder
from backend.services.persisted_jobs import restore_custom_jobs
from backend.services.seed_loader import SeedLoader


@pytest.mark.asyncio
async def test_custom_requirements_survive_cold_restore_and_ids_do_not_collide():
    previous = dict(app.dependency_overrides)
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=None, roles=['recruiter'])
    try:
        body = {'title': 'Persisted redesign role', 'department': 'Engineering', 'location': 'Pune',
                'description_raw': 'Build production Python services. Employment type: Contract',
                'requirements': [{'id': 'CUSTOM-REQ-001', 'requirement_text': 'Python', 'is_mandatory': True},
                                 {'id': 'CUSTOM-REQ-002', 'requirement_text': 'Docker', 'is_mandatory': False}]}
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            first = await client.post('/api/v1/jobs', json=body)
            second = await client.post('/api/v1/jobs', json=body)
            assert first.status_code == second.status_code == 201
            a, b = first.json(), second.json()
            assert {r['id'] for r in a['requirements']}.isdisjoint(r['id'] for r in b['requirements'])
            cold = SeedLoader(load_demo_data=False)
            cold.load_all()
            database = app.dependency_overrides[get_db]
            async for db in database():
                await restore_custom_jobs(db, cold)
            restored = cold.get_job(a['id'])
            assert restored.description_raw == body['description_raw']
            assert [(r.requirement_text, r.is_mandatory) for r in restored.requirements] == [('Python', True), ('Docker', False)]
            # Matching must resolve the restored job, not depend on the old process cache.
            app.dependency_overrides[get_context_builder] = lambda: SimpleNamespace(repository=cold)
            extracted = await client.post('/api/v1/jd/extract', json={'job_id': a['id']})
            assert extracted.status_code == 200
            assert extracted.json()[1]['is_mandatory'] is False
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
