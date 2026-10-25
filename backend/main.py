import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.config import settings
from backend.routers import candidates, health, jobs

# Setup logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
from backend.services.seed_loader import seed_loader

logger = logging.getLogger("mosaic.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle events for backend application."""
    logger.info("Starting up Mosaic Backend Service...")
    logger.info(f"Environment: {settings.ENVIRONMENT} | Debug: {settings.DEBUG}")
    # Preload seed data into memory
    seed_loader.load_all()
    yield
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
app.include_router(health.router)
app.include_router(health.router, prefix=settings.API_V1_PREFIX)
app.include_router(candidates.router, prefix=f"{settings.API_V1_PREFIX}/candidates")
app.include_router(candidates.router, prefix="/candidates")
app.include_router(jobs.router, prefix=f"{settings.API_V1_PREFIX}/jobs")
app.include_router(jobs.router, prefix="/jobs")


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
