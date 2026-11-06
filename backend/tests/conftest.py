"""Shared authenticated principal for pre-Phase-5 API regression tests."""
from types import SimpleNamespace
import pytest
from backend.core.dependencies import get_current_user
from backend.main import app


@pytest.fixture(scope="session", autouse=True)
def isolated_test_environment(tmp_path_factory):
    """Legacy tests need explicit fixtures; production repositories stay empty.

    Never use a developer's configured Clerk account or database in offline tests.
    """
    import asyncio
    from backend.config import settings
    from backend.core.database import get_db
    from backend.models.db import Base
    from backend.services.seed_loader import seed_loader
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    directory = tmp_path_factory.mktemp("database")
    engine = create_async_engine(f"sqlite+aiosqlite:///{(directory / 'tests.db').as_posix()}")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async def prepare():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    asyncio.run(prepare())
    async def test_db():
        async with sessions() as session:
            yield session
    previous = app.dependency_overrides.get(get_db)
    old_clerk = settings.CLERK_SECRET_KEY
    old_demo = seed_loader.load_demo_data
    old_data = seed_loader.data_dir
    old_settings_data = settings.DATA_DIR
    from pathlib import Path
    settings.DATA_DIR = seed_loader.data_dir = Path(__file__).resolve().parent / "data"
    settings.CLERK_SECRET_KEY = None
    seed_loader.load_demo_data = True
    seed_loader.load_all(force_reload=True)
    app.dependency_overrides[get_db] = test_db
    yield test_db
    settings.CLERK_SECRET_KEY = old_clerk
    seed_loader.load_demo_data = old_demo
    seed_loader.data_dir = old_data
    settings.DATA_DIR = old_settings_data
    if previous is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = previous
    asyncio.run(engine.dispose())


@pytest.fixture(autouse=True)
def isolated_database_per_test(isolated_test_environment):
    # Some legacy fixtures clear all overrides in teardown. Reinstall the
    # isolated database before every test rather than falling back to mosaic.db.
    from backend.core.database import get_db
    previous = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = isolated_test_environment
    yield
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous)

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
