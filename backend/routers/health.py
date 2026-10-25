from fastapi import APIRouter
from backend.config import settings

router = APIRouter(tags=["Health"])


@router.get("/health", summary="Service health check")
async def health_check():
    """Returns the service health status, version, and active environment."""
    return {
        "status": "ok",
        "app_name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "debug": settings.DEBUG,
    }
