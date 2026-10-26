"""Explicitly key-protected prototype seed rebuild; disabled without a key."""
import secrets
from fastapi import APIRouter, Depends, Header, HTTPException
from backend.config import settings
from backend.routers.ingest import get_context_builder
from backend.services.context_builder import ContextBuilder
from backend.services.signal_fetchers import default_cache

router = APIRouter(tags=["Administration"])


def get_signal_cache():
    return default_cache()


@router.post("/seed/rebuild")
async def rebuild_seed(x_admin_key: str | None = Header(default=None),
                       service: ContextBuilder = Depends(get_context_builder),
                       cache=Depends(get_signal_cache)):
    configured = settings.ADMIN_KEY.get_secret_value() if settings.ADMIN_KEY else ""
    if not configured:
        raise HTTPException(403, "Seed rebuild is disabled until ADMIN_KEY is configured.")
    if not x_admin_key or not secrets.compare_digest(x_admin_key.encode(), configured.encode()):
        raise HTTPException(401, "Invalid or missing admin key.")
    try:
        return await service.rebuild(cache)
    except Exception:
        raise HTTPException(503, "Seed rebuild failed. Check server configuration and retry.") from None
