"""Shared validation and dated observations; no total scoring or claim verification."""
import re
from contextlib import asynccontextmanager
from datetime import date, datetime
from urllib.parse import urlsplit

import httpx
from backend.config import settings
from backend.models import EvidenceRecord
from backend.services.scoring_engine import compute_recency_multiplier as recency_multiplier


def normalize_username(value: str, platform: str) -> str | None:
    value = value.strip()
    if not value:
        return None
    if "/" in value or ":" in value:
        try:
            parsed = urlsplit(value if "://" in value else "https://" + value)
            if parsed.scheme != "https" or (parsed.hostname or "").lower().removeprefix("www.") != platform + ".com":
                return None
            if parsed.username or parsed.password or parsed.port or parsed.query or parsed.fragment:
                return None
            parts = parsed.path.strip("/").split("/")
            if platform == "leetcode" and len(parts) == 2 and parts[0] == "u":
                parts = parts[1:]
            if len(parts) != 1:
                return None
            value = parts[0]
        except ValueError:
            return None
    pattern = r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?" if platform == "github" else r"[A-Za-z0-9_-]{1,64}"
    return value if re.fullmatch(pattern, value) else None


def observation_date(value: object, reference_date: date) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00")).date()
        return parsed if parsed <= reference_date else None
    except ValueError:
        return None


def make_record(*, candidate_id: str, skill: str, source_type: str, source_url: str,
                observation: str, base_weight: float, observed: date | None,
                reference_date: date, provenance) -> EvidenceRecord:
    multiplier = recency_multiplier(observed, reference_date)
    return EvidenceRecord(candidate_id=candidate_id, skill=skill, source_type=source_type,
                          source_url=source_url, observation=observation, base_weight=base_weight,
                          recency_multiplier=multiplier, computed_weight=base_weight * multiplier,
                          observation_date=observed, reference_date=reference_date, provenance=provenance)


@asynccontextmanager
async def http_client(client: httpx.AsyncClient | None):
    if client is not None:
        yield client
    else:
        async with httpx.AsyncClient(timeout=settings.SIGNAL_HTTP_TIMEOUT_SECONDS,
                                     follow_redirects=False, trust_env=False) as owned:
            yield owned
