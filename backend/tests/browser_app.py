"""Offline Playwright server: real APIs/builders, controlled synthetic adapters.

Used only by playwright.config.ts. Production startup remains backend.main:app.
"""
import importlib
from backend.models import EvidenceProvenance, EvidenceRecord
from backend.services.context_builder import ContextBuilder
from backend.services.deduplicator import ingestion_store
from backend.tests.test_context_builder import controlled_fetchers, NOW

main = importlib.import_module("backend.main")
ingest = importlib.import_module("backend.routers.ingest")
fetchers = controlled_fetchers()


async def synthetic_linkedin(profile, *, candidate_id, reference_date):
    if candidate_id != "CAND-001":
        return []
    return [EvidenceRecord(candidate_id=candidate_id, skill="Python", source_type="linkedin",
        source_url="https://example.test/synthetic-linkedin", observation="Synthetic LinkedIn stub mentions Python.",
        base_weight=1, recency_multiplier=.7, computed_weight=.7, observation_date=None,
        reference_date=reference_date, provenance=EvidenceProvenance.LINKEDIN_STUB)]


# Uploaded IDs have no fixture file and intentionally receive no test signals.
originals = fetchers.copy()
def for_known_candidates(source):
    async def fetch(profile, *, candidate_id, reference_date):
        if candidate_id not in {f"CAND-{i:03d}" for i in range(1, 7)}:
            return []
        return await originals[source](profile, candidate_id=candidate_id, reference_date=reference_date)
    return fetch
fetchers = {source: for_known_candidates(source) for source in originals}
fetchers["linkedin"] = synthetic_linkedin
service = ContextBuilder(ingestion_store, fetchers=fetchers, clock=lambda: NOW)
main.context_builder = service
ingest.context_builder = service
main.settings.ADMIN_KEY = None
app = main.app
