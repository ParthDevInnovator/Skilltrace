from fastapi import APIRouter
from backend.config import settings
from backend.services.seed_loader import seed_loader

router = APIRouter(tags=["Health"])


@router.get("/health", summary="Service health check")
async def health_check():
    """Returns service health, version, environment, and runtime record counts."""
    return {
        "status": "ok",
        "app_name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "debug": settings.DEBUG,
        "record_counts": seed_loader.stats(),
    }
