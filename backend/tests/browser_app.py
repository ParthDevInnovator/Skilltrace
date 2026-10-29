"""Offline Playwright server: real APIs/builders, controlled synthetic adapters.

Used only by playwright.config.ts. Production startup remains backend.main:app.
"""
import importlib
import json
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

# Deterministic offline Phase 4 provider used only by browser acceptance tests.
async def controlled_generate(prompt, system, temperature=0.0, max_tokens=2000):
    if 'grounded executive brief' in system.lower():
        data = json.loads(prompt)
        evidence = data['evidence_records'][0]['id']
        claim = data['claims'][0]['id']
        return (f"## Strengths\nGrounded strength {evidence}.\n\n## Evidence Summary\nEvidence {evidence}.\n\n"
                f"## Application History Notes\nNo prior history is recorded.\n\n## Identified Gaps\nValidate {claim}."), 'gemini'
    if 'interview question' in system.lower():
        targets = json.loads(prompt)['targets'][:3]
        return json.dumps([{'question_text': f"Please validate {item['source_id']}?", 'target_type': item['target_type'],
            'source_id': item['source_id'], 'rationale': f"This probes {item['source_id']}."} for item in targets]), 'gemini'
    data = json.loads(prompt)
    history = data['history']
    tools = [item for item in history if item.get('role') == 'tool']
    if not tools:
        return json.dumps({'tool_call': {'name': 'lookup_candidate', 'arguments': {'name': 'CAND-001'}}}), 'gemini'
    if len(tools) == 1:
        return json.dumps({'tool_call': {'name': 'get_candidate_context', 'arguments': {'candidate_id': 'CAND-001'}}}), 'gemini'
    context = json.loads(tools[-1]['content'])
    evidence = context['evidence_records'][0]['id']
    return f"The strongest grounded signal is supported by {evidence}.", 'gemini'

import backend.services.agent.orchestrator as orchestrator
import backend.services.agent.brief_generator as brief_generator
import backend.services.agent.question_generator as question_generator
orchestrator.generate_with_fallback = controlled_generate
brief_generator.generate_with_fallback = controlled_generate
question_generator.generate_with_fallback = controlled_generate
app = main.app
