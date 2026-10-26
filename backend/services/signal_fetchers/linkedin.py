"""Synthetic LinkedIn fixtures only. No live retrieval or scraping is implemented.

Every returned record is labeled synthetic, and this module never uses the
network or signal cache. Fixtures are not verified professional profiles.
"""
import asyncio
import json
import logging
import re
from datetime import date
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, HttpUrl
from backend.config import settings
from backend.models import EvidenceProvenance, EvidenceRecord
from backend.models.context import NonBlankString
from backend.services.claim_extractor import DEFAULT_SKILLS
from .common import make_record

logger = logging.getLogger(__name__)


class LinkedInFixture(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidate_id: NonBlankString
    profile_url: HttpUrl
    provenance: str
    headline: str = Field(default="", max_length=2000)
    about: str = Field(default="", max_length=10000)
    observation_date: date | None = None


async def fetch_linkedin(profile_url: str, candidate_id: str, *, reference_date: date,
                         fixture_dir: str | Path | None = None) -> list[EvidenceRecord]:
    try:
        if not re.fullmatch(r"CAND-[0-9]+", candidate_id):
            return []
        # Explicit profile shape, without treating URL existence as verification.
        from urllib.parse import urlsplit
        parsed = urlsplit(profile_url)
        host = (parsed.hostname or "").lower().removeprefix("www.")
        if parsed.scheme != "https" or host != "linkedin.com" or parsed.query or parsed.fragment or parsed.username or parsed.password or parsed.port:
            return []
        parts = parsed.path.strip("/").split("/")
        if len(parts) != 2 or parts[0] != "in" or not re.fullmatch(r"[A-Za-z0-9_-]+", parts[1]):
            return []
        directory = Path(fixture_dir) if fixture_dir is not None else settings.DATA_DIR / "linkedin_stubs"
        path = directory / f"{candidate_id}.json"
        def read_fixture():
            if not path.is_file() or path.stat().st_size > 64 * 1024:
                return None
            return LinkedInFixture.model_validate_json(path.read_text(encoding="utf-8"))
        fixture = await asyncio.to_thread(read_fixture)
        if fixture is None or fixture.candidate_id != candidate_id or fixture.provenance != EvidenceProvenance.LINKEDIN_STUB.value:
            return []
        normalized = f"https://linkedin.com/in/{parts[1]}"
        if str(fixture.profile_url).rstrip("/").replace("https://www.", "https://") != normalized:
            return []
        text = (fixture.headline + "\n" + fixture.about).strip()
        observed = fixture.observation_date
        if observed and observed > reference_date:
            observed = None
        records = []
        for skill in DEFAULT_SKILLS:
            if re.search(rf"(?<!\w){re.escape(skill)}(?!\w)", text, re.I):
                records.append(make_record(candidate_id=candidate_id, skill=skill, source_type="linkedin",
                    source_url=normalized, observation=f"Synthetic LinkedIn stub mentions {skill}: {text}",
                    base_weight=1, observed=observed, reference_date=reference_date,
                    provenance=EvidenceProvenance.LINKEDIN_STUB))
        return records
    except Exception:
        logger.warning("Synthetic LinkedIn fixture unavailable")
        return []
