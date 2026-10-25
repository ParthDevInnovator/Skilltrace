from fastapi import APIRouter
from backend.config import settings
from backend.services.seed_loader import seed_loader

router = APIRouter(tags=["Health"])


@router.get("/health", summary="Service health check")
async def health_check():
    """Returns the service health status, version, active environment, and seed data stats."""
    return {
        "status": "ok",
        "app_name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "debug": settings.DEBUG,
        "seed_stats": seed_loader.stats(),
    }
