import asyncio
import logging
from collections.abc import AsyncIterator
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.config import settings
from backend.models.db import Base

logger = logging.getLogger(__name__)

engine_options = {"pool_pre_ping": True}
if not settings.DATABASE_URL.startswith("sqlite"):
    engine_options.update(pool_size=settings.DB_POOL_SIZE, max_overflow=settings.DB_MAX_OVERFLOW)
engine = create_async_engine(settings.DATABASE_URL, **engine_options)


def configure_sqlite(async_engine) -> None:
    """WAL + busy timeout: request reads never block background writers (audit, persistence)."""
    if async_engine.dialect.name != "sqlite":
        return
    from sqlalchemy import event

    @event.listens_for(async_engine.sync_engine, "connect")
    def _pragmas(connection, _record):
        cursor = connection.cursor()
        try:
            database = async_engine.url.database or ""
            if database and database != ":memory:":
                cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=10000")
        finally:
            cursor.close()


configure_sqlite(engine)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

# Background writers (runtime persistence, audit delivery) cannot use request
# dependencies. They resolve their session factory here so isolated test
# databases can replace it in one place.
_session_factory: async_sessionmaker = AsyncSessionLocal


def session_factory() -> async_sessionmaker:
    return _session_factory


def set_session_factory(factory: async_sessionmaker | None) -> async_sessionmaker:
    """Replace the background session factory; returns the previous one."""
    global _session_factory
    previous = _session_factory
    _session_factory = factory or AsyncSessionLocal
    return previous


async def get_db() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        yield session


async def create_all_tables() -> None:
    bind = _session_factory.kw.get("bind") or engine
    async with bind.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


def _upgrade_to_head() -> None:
    # A separate process: revision 0001 edits the shared model metadata while it
    # runs, which must never happen inside the serving process.
    import subprocess
    import sys
    root = Path(__file__).resolve().parents[2]
    result = subprocess.run([sys.executable, "-m", "alembic", "-c", str(root / "alembic.ini"), "upgrade", "head"],
                            cwd=root, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise RuntimeError(f"alembic upgrade failed: {result.stderr.strip()[-2000:]}")


async def prepare_database() -> None:
    """Bring an existing database to the current schema, then create anything missing.

    ``create_all`` never adds columns to existing tables, so a database created
    by an older release must be migrated before the application reads it.
    """
    if settings.DATABASE_AUTO_MIGRATE:
        try:
            await asyncio.to_thread(_upgrade_to_head)
        except Exception:
            logger.exception("Database migration failed; run `alembic upgrade head` manually")
            raise
    await create_all_tables()
