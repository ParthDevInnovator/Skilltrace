import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.config import settings
from backend.routers import candidates, health, jobs, ingest, admin, jd
from backend.routers import agent, graph, auth, notifications
from backend.core.database import prepare_database, session_factory
from backend.core.openapi import install_openapi
from backend.core.retention import purge_expired_evidence
from backend.middleware.security import SecurityHeadersMiddleware
from backend.middleware.audit import AuditMiddleware

# Setup logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
from backend.services.seed_loader import seed_loader
from backend.services.context_builder import context_builder

logger = logging.getLogger("mosaic.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle events for backend application."""
    logger.info("Starting up Skitrace Backend Service...")
    logger.info(f"Environment: {settings.ENVIRONMENT} | Debug: {settings.DEBUG}")
    # OI-02 (decision D2): one worker only. Caches, build tasks and rate limits are process-local.
    workers = int(os.environ.get("WEB_CONCURRENCY", "1") or 1)
    if workers > settings.SUPPORTED_WORKERS:
        message = (f"WEB_CONCURRENCY={workers} but Skitrace supports {settings.SUPPORTED_WORKERS} worker; "
                   "run a single worker per database")
        if settings.ENVIRONMENT.lower() in {"production", "prod"}:
            raise RuntimeError(message)
        logger.error(message)
    await prepare_database()
    from backend.services.admission import ensure_default_workspace
    from backend.services.sessions import purge_expired
    async with session_factory()() as db:
        await ensure_default_workspace(db)
        await purge_expired(db)
    if settings.E2E_BOOTSTRAP_USERS and settings.ENVIRONMENT == "e2e":
        from sqlalchemy import select
        from backend.core.security import hash_password
        from backend.models.db import User
        async with session_factory()() as db:
            for email, name, roles in (
                ("recruiter@example.com", "Recruiter Test", ["recruiter"]),
                ("manager@example.com", "Hiring Manager Test", ["hiring_manager"]),
                ("admin@example.com", "HR Admin Test", ["hr_admin"]),
            ):
                if not await db.scalar(select(User).where(User.email == email)):
                    db.add(User(email=email, full_name=name, roles=roles, hashed_password=hash_password("Phase5Test!"),
                                workspace_id=settings.DEFAULT_WORKSPACE_ID, email_verified=True))
            await db.commit()
    async with session_factory()() as db:
        logger.info("Purged %s expired evidence records", await purge_expired_evidence(db))
    # Initialize the runtime repository. Production starts empty; candidates and
    # jobs enter through the ingestion and job-creation APIs, and are restored
    # from the database after a restart (OI-01).
    seed_loader.load_all()
    service = context_builder
    if service.persistence is not None:
        await service.persistence.restore(service)
    else:  # Isolated builders without durable storage still see persisted jobs.
        from backend.services.persisted_jobs import restore_custom_jobs
        async with session_factory()() as db:
            await restore_custom_jobs(db, seed_loader)
    app.state.context_builder = service
    service.start_all(wait_for_requests=True)
    from backend.services.llm.router import get_provider_router
    get_provider_router()
    try:
        yield
    finally:
        await service.shutdown()
        from backend.services.audit import audit_writer
        await audit_writer.flush()
        from backend.services.graph.neo4j_client import get_graph_client
        await get_graph_client().close()
        get_graph_client.cache_clear()
        if getattr(app.state, "context_builder", None) is service:
            del app.state.context_builder
        logger.info("Shutting down Skitrace Backend Service...")


app = FastAPI(
    title=f"{settings.APP_NAME} API",
    description="Skitrace — Beyond the Resume: AI-Powered Candidate Intelligence & Evidence-Based Recruitment Backend",
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(AuditMiddleware)


@app.middleware("http")
async def release_context_startup(request: Request, call_next):
    # A received HTTP request proves that the server accepts traffic. Workers
    # are queued at startup, but cannot finish before readiness is established.
    service = getattr(request.app.state, "context_builder", None)
    if service is not None:
        service.release_startup()
    return await call_next(request)


# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "message": str(exc) if settings.DEBUG else "An unexpected error occurred.",
            "path": request.url.path,
        },
    )


# Mount routers. Unprefixed aliases keep serving requests but are hidden from
# Swagger so each operation is documented once, under /api/v1.
app.include_router(jd.router, prefix="/api/v1/jd")
app.include_router(jd.router, prefix="/jd", include_in_schema=False)
app.include_router(health.router)
app.include_router(health.router, prefix=settings.API_V1_PREFIX)
app.include_router(candidates.router, prefix=f"{settings.API_V1_PREFIX}/candidates")
app.include_router(candidates.router, prefix="/candidates", include_in_schema=False)
app.include_router(jobs.router, prefix=f"{settings.API_V1_PREFIX}/jobs")
app.include_router(jobs.router, prefix="/jobs", include_in_schema=False)
app.include_router(ingest.router, prefix=f"{settings.API_V1_PREFIX}/ingest")
app.include_router(admin.router)
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(notifications.router, prefix=settings.API_V1_PREFIX)
for feature in (agent.router, graph.router):
    app.include_router(feature, prefix=settings.API_V1_PREFIX)
    app.include_router(feature, include_in_schema=False)

install_openapi(app)


@app.get("/", tags=["Root"])
async def root():
    return {
        "message": f"Welcome to {settings.APP_NAME} API",
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "health": "/health",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
