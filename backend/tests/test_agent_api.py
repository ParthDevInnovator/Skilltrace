from datetime import datetime, timezone

import httpx
import pytest

from backend.main import app
from backend.services.agent.models import AgentResponse, CandidateBrief, InterviewQuestionSet
from backend.services.llm.provider import LLMProviderError, ProviderName
from backend.tests.test_context_api import api_service


@pytest.mark.asyncio
async def test_chat_contract_history_validation_and_provider_failure(api_service, monkeypatch):
    captured = {}

    async def turn(history, message, job_id):
        captured.update(history=history, message=message, job_id=job_id)
        return AgentResponse(assistant_message='Grounded answer OBS-1', tool_calls_made=1,
                             provider_used=ProviderName.GEMINI, grounding_ids=['OBS-1'])

    monkeypatch.setattr('backend.routers.agent.run_agent_turn', turn)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        response = await client.post('/api/v1/agent/chat', json={'message': ' question ', 'job_id': 'JOB-001',
            'history': [{'role': 'user', 'content': str(i)} for i in range(25)]})
        assert response.status_code == 200 and response.json()['grounding_ids'] == ['OBS-1']
        assert captured['message'] == 'question' and captured['job_id'] == 'JOB-001'
        assert len(captured['history']) == 20 and captured['history'][0].content == '5'
        assert (await client.post('/agent/chat', json={'message': '   '})).status_code == 422

        async def unavailable(*_):
            raise LLMProviderError('gemini', 503, 'down', provider_errors=[{'provider': 'gemini'}, {'provider': 'groq'}])
        monkeypatch.setattr('backend.routers.agent.run_agent_turn', unavailable)
        failed = await client.post('/agent/chat', json={'message': 'hello'})
        assert failed.status_code == 503 and failed.json()['detail'] == 'AI providers unavailable'
        assert len(failed.json()['provider_errors']) == 2


@pytest.mark.asyncio
async def test_brief_contract_ready_building_unknown_and_failure(api_service, monkeypatch):
    service, _ = api_service
    await service.build_context(service.repository.get_candidate('CAND-001'))

    async def brief(*_):
        return CandidateBrief(candidate_id='CAND-001', job_id='JOB-001', generated_at=datetime.now(timezone.utc),
            provider_used=ProviderName.GROQ, strengths='s', evidence_summary='e',
            application_history_notes='a', identified_gaps='g', grounding_ids=['OBS-1'])
    monkeypatch.setattr('backend.routers.agent.generate_brief', brief)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        ready = await client.post('/api/v1/candidates/CAND-001/brief', json={'job_id': 'JOB-001'})
        assert ready.status_code == 200 and set(('strengths', 'evidence_summary', 'application_history_notes', 'identified_gaps')) <= ready.json().keys()
        service.reserve('CAND-002')
        assert (await client.post('/candidates/CAND-002/brief', json={})).status_code == 202
        assert (await client.post('/candidates/missing/brief', json={})).status_code == 404

        async def unavailable(*_):
            raise LLMProviderError('groq', 503, 'down')
        monkeypatch.setattr('backend.routers.agent.generate_brief', unavailable)
        assert (await client.post('/candidates/CAND-001/brief', json={})).status_code == 503


@pytest.mark.asyncio
async def test_question_contract_and_validation(api_service, monkeypatch):
    service, _ = api_service
    await service.build_context(service.repository.get_candidate('CAND-001'))

    async def questions(*_):
        return InterviewQuestionSet(candidate_id='CAND-001', job_id='JOB-001', generated_at=datetime.now(timezone.utc),
            provider_used=ProviderName.GEMINI, questions=[{'question_text': 'Explain it?', 'target_type': 'coverage_gap',
            'source_id': 'REQ-1', 'rationale': 'Requirement REQ-1 is not assessed.'}], grounding_ids=['REQ-1'])
    monkeypatch.setattr('backend.routers.agent.generate_interview_questions', questions)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        result = await client.post('/api/v1/candidates/CAND-001/interview-questions', json={'job_id': 'JOB-001'})
        assert result.status_code == 200 and result.json()['questions'][0]['source_id'] == 'REQ-1'
        assert (await client.post('/candidates/CAND-001/interview-questions', json={})).status_code == 422
        assert (await client.post('/candidates/missing/interview-questions', json={'job_id': 'JOB-001'})).status_code == 404
        assert (await client.post('/candidates/CAND-001/interview-questions', json={'job_id': 'missing'})).status_code == 404


@pytest.mark.asyncio
async def test_chat_rejects_unknown_job(api_service):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        response = await client.post('/api/v1/agent/chat', json={'message': 'hello', 'job_id': 'missing'})
        assert response.status_code == 404


@pytest.mark.asyncio
async def test_brief_returns_failed_context_status(api_service):
    service, _ = api_service
    revision = service.reserve('CAND-001')
    service.registry.finish('CAND-001', revision, error='synthetic context failure')
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        response = await client.post('/api/v1/candidates/CAND-001/brief', json={})
        assert response.status_code == 503 and response.json()['detail'] == 'synthetic context failure'
