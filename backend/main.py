import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.config import settings
from backend.routers import candidates, health, jobs, ingest, admin, jd, auth
from backend.routers import agent, graph
from backend.core.database import AsyncSessionLocal, create_all_tables
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
    logger.info("Starting up Mosaic Backend Service...")
    logger.info(f"Environment: {settings.ENVIRONMENT} | Debug: {settings.DEBUG}")
    await create_all_tables()
    if settings.AUTO_SEED_DB:
        from backend.scripts.seed_db import seed_database
        await seed_database()
    if settings.E2E_BOOTSTRAP_USERS:
        from sqlalchemy import select
        from backend.core.security import hash_password
        from backend.models.db import User
        async with AsyncSessionLocal() as db:
            for email, name, roles in (
                ("recruiter@example.com", "Recruiter Test", ["recruiter"]),
                ("manager@example.com", "Hiring Manager Test", ["hiring_manager"]),
                ("admin@example.com", "HR Admin Test", ["hr_admin"]),
            ):
                if not await db.scalar(select(User).where(User.email == email)):
                    db.add(User(email=email, full_name=name, roles=roles, hashed_password=hash_password("Phase5Test!")))
            await db.commit()
    async with AsyncSessionLocal() as db:
        logger.info("Purged %s expired evidence records", await purge_expired_evidence(db))
    # Preload seed data into memory
    seed_loader.load_all()
    service = context_builder
    app.state.context_builder = service
    service.start_all(wait_for_requests=True)
    from backend.services.llm.router import get_provider_router
    get_provider_router()
    try:
        yield
    finally:
        await service.shutdown()
        from backend.services.graph.neo4j_client import get_graph_client
        await get_graph_client().close()
        get_graph_client.cache_clear()
        if getattr(app.state, "context_builder", None) is service:
            del app.state.context_builder
        logger.info("Shutting down Mosaic Backend Service...")


app = FastAPI(
    title=f"{settings.APP_NAME} API",
    description="Mosaic — Beyond the Resume: AI-Powered Candidate Intelligence & Evidence-Based Recruitment Backend",
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


# Mount routers
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(jd.router, prefix="/api/v1/jd")
app.include_router(jd.router, prefix="/jd")
app.include_router(health.router)
app.include_router(health.router, prefix=settings.API_V1_PREFIX)
app.include_router(candidates.router, prefix=f"{settings.API_V1_PREFIX}/candidates")
app.include_router(candidates.router, prefix="/candidates")
app.include_router(jobs.router, prefix=f"{settings.API_V1_PREFIX}/jobs")
app.include_router(jobs.router, prefix="/jobs")
app.include_router(ingest.router, prefix=f"{settings.API_V1_PREFIX}/ingest")
app.include_router(admin.router)
for feature in (agent.router, graph.router):
    app.include_router(feature, prefix=settings.API_V1_PREFIX)
    app.include_router(feature)


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
