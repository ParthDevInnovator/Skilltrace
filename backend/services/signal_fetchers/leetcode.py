"""Best-effort public GraphQL language statistics; never verifies claims."""
import asyncio
import logging
from datetime import date

import httpx
from backend.config import settings
from backend.models import EvidenceProvenance, EvidenceRecord
from . import SignalCache, default_cache
from .common import http_client, make_record, normalize_username

logger = logging.getLogger(__name__)
QUERY = """query languageStats($username: String!) {
  matchedUser(username: $username) {
    languageProblemCount { languageName problemsSolved }
  }
}"""


async def fetch_leetcode(username_or_url: str, *, candidate_id: str, reference_date: date,
                         client: httpx.AsyncClient | None = None,
                         cache: SignalCache | None = None) -> list[EvidenceRecord]:
    try:
        username = normalize_username(username_or_url, "leetcode")
        if username is None:
            return []
        cache = cache if cache is not None else default_cache()
        key = f"leetcode:v1:{username}"
        cached = await asyncio.to_thread(cache.get_cached, key)
        provenance = EvidenceProvenance.DISK_CACHE if cached else EvidenceProvenance.LIVE
        if cached:
            languages = cached.payload
        else:
            async with http_client(client) as session:
                response = await session.post("https://leetcode.com/graphql",
                    json={"query": QUERY, "variables": {"username": username}},
                    headers={"User-Agent": "Skilltrace", "Referer": "https://leetcode.com"},
                    timeout=settings.SIGNAL_HTTP_TIMEOUT_SECONDS, follow_redirects=False)
                response.raise_for_status()
                if response.status_code != 200:
                    raise ValueError("Unexpected GraphQL status")
                data = response.json()
            if not isinstance(data, dict) or data.get("errors") or not isinstance(data.get("data"), dict):
                raise ValueError("GraphQL error or invalid response")
            user = data["data"].get("matchedUser")
            if user is None:
                languages = []
            else:
                languages = user["languageProblemCount"]
                if not isinstance(languages, list):
                    raise ValueError("Invalid language statistics")
            await asyncio.to_thread(cache.set_cached, key, languages)
        if not isinstance(languages, list):
            raise ValueError("Invalid cached language statistics")
        records = []
        seen = set()
        for item in languages[:100]:
            language, count = item.get("languageName"), item.get("problemsSolved")
            if not isinstance(language, str) or not language.strip() or type(count) is not int or count <= 0:
                continue
            if language.casefold() in seen:
                continue
            seen.add(language.casefold())
            records.append(make_record(candidate_id=candidate_id, skill=language, source_type="leetcode",
                source_url=f"https://leetcode.com/u/{username}/",
                observation=f"Public LeetCode statistics report {count} solved problems in {language}; this signal is undated.",
                base_weight=1, observed=None, reference_date=reference_date, provenance=provenance))
        return records
    except Exception:
        logger.warning("LeetCode signal retrieval unavailable")
        return []
