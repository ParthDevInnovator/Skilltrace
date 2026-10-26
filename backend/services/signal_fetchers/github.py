"""Bounded GitHub public-repository observations with real commit dates."""
import asyncio
import logging
import re
from datetime import date

import httpx
from backend.config import settings
from backend.models import EvidenceProvenance, EvidenceRecord
from . import SignalCache, default_cache
from .common import http_client, make_record, normalize_username, observation_date

logger = logging.getLogger(__name__)


async def fetch_github(username_or_url: str, *, candidate_id: str, reference_date: date,
                       client: httpx.AsyncClient | None = None,
                       cache: SignalCache | None = None) -> list[EvidenceRecord]:
    try:
        username = normalize_username(username_or_url, "github")
        if username is None:
            return []
        cache = cache if cache is not None else default_cache()
        key = f"github:v1:{username.casefold()}"
        cached = await asyncio.to_thread(cache.get_cached, key)
        provenance = EvidenceProvenance.DISK_CACHE if cached else EvidenceProvenance.LIVE
        if cached:
            observations = cached.payload
        else:
            headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10", "User-Agent": "Skilltrace"}
            if settings.GITHUB_TOKEN and settings.GITHUB_TOKEN.get_secret_value():
                headers["Authorization"] = "Bearer " + settings.GITHUB_TOKEN.get_secret_value()
            async with http_client(client) as session:
                response = await session.get(f"https://api.github.com/users/{username}/repos",
                    params={"per_page": 100, "sort": "updated"}, headers=headers,
                    timeout=settings.SIGNAL_HTTP_TIMEOUT_SECONDS, follow_redirects=False)
                response.raise_for_status()
                if response.status_code != 200:
                    raise ValueError("Unexpected repository status")
                data = response.json()
                if not isinstance(data, list):
                    raise ValueError("Invalid repository response")
                selected = []
                seen = set()
                for repo in data:
                    if not isinstance(repo, dict) or repo.get("private") is True:
                        continue
                    full_name = repo.get("full_name", "")
                    if not isinstance(full_name, str) or not re.fullmatch(r"[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+", full_name):
                        continue
                    if full_name.split("/")[1] in {".", ".."} or full_name.casefold() in seen:
                        continue
                    stars = repo.get("stargazers_count", 0)
                    if repo.get("fork") and (not isinstance(stars, int) or stars < 10):
                        continue
                    seen.add(full_name.casefold())
                    selected.append(repo)
                    if len(selected) == 30:
                        break
                limiter = asyncio.Semaphore(5)
                async def get_observation(repo):
                    full_name = repo["full_name"]
                    async with limiter:
                        commit_response = await session.get(f"https://api.github.com/repos/{full_name}/commits",
                            params={"per_page": 1}, headers=headers, timeout=settings.SIGNAL_HTTP_TIMEOUT_SECONDS, follow_redirects=False)
                        # An empty repository has no date to assess.
                        if commit_response.status_code == 409:
                            commits = []
                        else:
                            commit_response.raise_for_status()
                            if commit_response.status_code != 200:
                                raise ValueError("Unexpected commit status")
                            commits = commit_response.json()
                        if not isinstance(commits, list):
                            raise ValueError("Invalid commit response")
                        latest = commits[0].get("commit", {}).get("committer", {}).get("date") if commits else None
                    topics = repo.get("topics", [])
                    language = repo.get("language")
                    return {"full_name": full_name, "language": language if isinstance(language, str) else None,
                            "topics": list(dict.fromkeys(topic for topic in topics if isinstance(topic, str) and topic.strip()))[:20] if isinstance(topics, list) else [],
                            "commit_date": latest}
                observations = await asyncio.gather(*(get_observation(repo) for repo in selected), return_exceptions=True)
                if any(isinstance(item, BaseException) for item in observations):
                    raise ValueError("Repository observation retrieval failed")
            await asyncio.to_thread(cache.set_cached, key, observations)
        if not isinstance(observations, list):
            raise ValueError("Invalid cached observations")
        records = []
        for item in observations[:30]:
            full_name = item["full_name"]
            url = f"https://github.com/{full_name}"
            observed = observation_date(item.get("commit_date"), reference_date)
            language = item.get("language")
            if language:
                records.append(make_record(candidate_id=candidate_id, skill=language, source_type="github", source_url=url,
                    observation=f"Public repository {full_name} lists {language} as its primary language. Repository activity does not establish candidate authorship.",
                    base_weight=3, observed=observed, reference_date=reference_date, provenance=provenance))
            for topic in item.get("topics", []):
                records.append(make_record(candidate_id=candidate_id, skill=topic, source_type="github", source_url=url,
                    observation=f"Public repository {full_name} declares topic '{topic}'. This is a repository tag, not a verified resume claim.",
                    base_weight=2, observed=observed, reference_date=reference_date, provenance=provenance))
        return records
    except Exception:
        logger.warning("GitHub signal retrieval unavailable")
        return []
