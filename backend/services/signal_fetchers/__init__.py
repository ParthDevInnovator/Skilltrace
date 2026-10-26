"""Lazy disk cache for successful public signal responses, never synthetic data."""
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from diskcache import Cache
from backend.config import settings
from backend.models import EvidenceProvenance

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CachedPayload:
    payload: object
    fetched_at: datetime


class SignalCache:
    def __init__(self, path: str | Path, ttl_seconds: int = 21600):
        if ttl_seconds <= 0:
            raise ValueError("Cache TTL must be positive")
        self.path = Path(path)
        self.ttl_seconds = ttl_seconds

    def clear(self) -> None:
        """Remove entries only; retain the cache directory and configuration."""
        with Cache(str(self.path), timeout=1) as cache:
            cache.clear()

    def get_cached(self, key: str) -> CachedPayload | None:
        try:
            with Cache(str(self.path), timeout=1) as cache:
                stored = cache.get(key)
            if not isinstance(stored, str):
                return None
            data = json.loads(stored)
            if data.get("provenance") != EvidenceProvenance.LIVE.value:
                return None
            timestamp = datetime.fromisoformat(data["fetched_at"])
            if timestamp.tzinfo is None:
                return None
            return CachedPayload(data["payload"], timestamp)
        except Exception:
            logger.warning("Signal cache read unavailable")
            return None

    def set_cached(self, key: str, value: object, ttl_seconds: int | None = None,
                   *, provenance: EvidenceProvenance = EvidenceProvenance.LIVE) -> bool:
        if provenance != EvidenceProvenance.LIVE:
            return False
        ttl = self.ttl_seconds if ttl_seconds is None else ttl_seconds
        if ttl <= 0:
            return False
        try:
            encoded = json.dumps({"payload": value, "fetched_at": datetime.now(timezone.utc).isoformat(),
                                  "provenance": EvidenceProvenance.LIVE.value}, allow_nan=False)
            with Cache(str(self.path), timeout=1) as cache:
                return cache.set(key, encoded, expire=ttl)
        except Exception:
            logger.warning("Signal cache write unavailable")
            return False


@lru_cache(maxsize=1)
def default_cache() -> SignalCache:
    return SignalCache(settings.SIGNAL_CACHE_DIR, settings.SIGNAL_CACHE_TTL_SECONDS)


def get_cached(key: str) -> CachedPayload | None:
    return default_cache().get_cached(key)


def set_cached(key: str, value: object, ttl_seconds: int | None = None,
               *, provenance: EvidenceProvenance = EvidenceProvenance.LIVE) -> bool:
    return default_cache().set_cached(key, value, ttl_seconds, provenance=provenance)
