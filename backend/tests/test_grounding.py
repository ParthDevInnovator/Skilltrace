import json

import pytest

from backend.services.agent.brief_generator import generate_brief
from backend.services.agent.orchestrator import run_agent_turn, CAP_MESSAGE
from backend.services.agent.question_generator import generate_interview_questions
from backend.services.agent.tools import current_service
from backend.services.context_builder import ContextBuilder
from backend.services.deduplicator import ResumeIngestionStore
from backend.services.llm.provider import ProviderName
from backend.services.seed_loader import SeedLoader
from backend.tests.test_context_builder import controlled_fetchers, DATA_DIR, NOW


@pytest.fixture
async def grounded_service():
    service = ContextBuilder(ResumeIngestionStore(SeedLoader(data_dir=DATA_DIR)), fetchers=controlled_fetchers(), clock=lambda: NOW)
    service.repository.load_all()
    await service.build_context(service.repository.get_candidate('CAND-001'))
    token = current_service.set(service)
    yield service
    current_service.reset(token)


@pytest.mark.asyncio
async def test_agent_removes_invented_grounding_id(grounded_service, monkeypatch):
    calls = 0
    async def generate(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            return json.dumps({'tool_call': {'name': 'lookup_candidate', 'arguments': {'name': 'Alex Rivera'}}}), ProviderName.GEMINI
        if calls == 2:
            return json.dumps({'tool_call': {'name': 'get_candidate_context', 'arguments': {'candidate_id': 'CAND-001'}}}), ProviderName.GEMINI
        real = grounded_service.registry.get('CAND-001').context.evidence_records[0].id
        return f'Real {real}; invented CLAIM-DOES-NOT-EXIST.', ProviderName.GEMINI
    monkeypatch.setattr('backend.services.agent.orchestrator.generate_with_fallback', generate)
    response = await run_agent_turn([], 'Tell me about Alex Rivera', None)
    assert 'CLAIM-DOES-NOT-EXIST' not in response.assistant_message
    assert 'CLAIM-DOES-NOT-EXIST' not in response.grounding_ids


@pytest.mark.asyncio
async def test_brief_and_questions_reject_invented_ids(grounded_service, monkeypatch):
    context = grounded_service.registry.get('CAND-001').context
    real = context.claims[0].id
    async def brief_text(*_args, **_kwargs):
        return '\n'.join([f'## Strengths\nSupported by {real} and FAKE-ID.', '## Evidence Summary\nEvidence.',
            '## Application History Notes\nNone.', '## Identified Gaps\nValidate FAKE-ID.']), ProviderName.GEMINI
    monkeypatch.setattr('backend.services.agent.brief_generator.generate_with_fallback', brief_text)
    brief = await generate_brief('CAND-001', None, NOW.date())
    assert 'FAKE-ID' not in brief.grounding_ids and real in brief.grounding_ids

    async def question_text(*_args, **_kwargs):
        return json.dumps([{'question_text': 'Explain CLAIM-DOES-NOT-EXIST?', 'target_type': 'unverified_claim',
            'source_id': real, 'rationale': f'Probe {real}.'}]), ProviderName.GEMINI
    monkeypatch.setattr('backend.services.agent.question_generator.generate_with_fallback', question_text)
    questions = await generate_interview_questions('CAND-001', 'JOB-001', NOW.date())
    assert questions.questions == []


@pytest.mark.asyncio
async def test_tool_call_cap_is_exactly_five(grounded_service, monkeypatch):
    calls = 0
    async def loop(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        return json.dumps({'tool_call': {'name': 'list_jobs', 'arguments': {}}}), ProviderName.GROQ
    monkeypatch.setattr('backend.services.agent.orchestrator.generate_with_fallback', loop)
    response = await run_agent_turn([], 'loop', None)
    assert calls == response.tool_calls_made == 5 and response.assistant_message == CAP_MESSAGE
