"""Shared authenticated principal for pre-Phase-5 API regression tests."""
from types import SimpleNamespace
import pytest
from backend.core.dependencies import get_current_user
from backend.main import app

AUTHENTICATED_LEGACY_MODULES={
 'test_agent_api.py','test_candidates.py','test_context_api.py','test_graph.py',
 'test_jobs.py','test_matching_api.py','test_resume_pipeline.py',
}

@pytest.fixture(autouse=True)
def authenticated_legacy_api(request):
    if request.path.name not in AUTHENTICATED_LEGACY_MODULES:
        yield;return
    previous=dict(app.dependency_overrides)
    app.dependency_overrides[get_current_user]=lambda:SimpleNamespace(
        id='00000000-0000-0000-0000-000000000001',email='legacy@test.local',
        full_name='Legacy Test Admin',roles=['hr_admin'],is_active=True)
    try:yield
    finally:
        app.dependency_overrides.clear();app.dependency_overrides.update(previous)
