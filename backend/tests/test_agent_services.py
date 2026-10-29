"""Unit tests for agent services: tools, orchestrator, brief, and question generators."""
import json
from datetime import datetime, timezone
import pytest

from backend.models import EvidenceRecord
from backend.services.context_builder import ContextBuilder
from backend.services.deduplicator import ResumeIngestionStore
from backend.services.seed_loader import SeedLoader
from backend.services.llm.provider import ProviderName
from backend.services.agent.models import ChatMessage, BuildingStatus, FailedStatus
from backend.services.agent.tools import (
    current_service,
    lookup_candidate,
    get_candidate_context,
    get_evidence_for_skill,
    list_jobs,
    get_jd_match,
)
from backend.services.agent.orchestrator import run_agent_turn, CAP_MESSAGE
from backend.services.agent.brief_generator import generate_brief, MISSING_SECTION
from backend.services.agent.question_generator import generate_interview_questions
from backend.tests.test_context_builder import controlled_fetchers, DATA_DIR, NOW


@pytest.fixture
def agent_service():
    store = ResumeIngestionStore(SeedLoader(data_dir=DATA_DIR))
    store.repository.load_all()
    builder = ContextBuilder(store, fetchers=controlled_fetchers(), clock=lambda: NOW)
    token = current_service.set(builder)
    yield builder
    current_service.reset(token)


# --- 1. Tool Handlers ---

@pytest.mark.asyncio
async def test_tool_lookup_candidate(agent_service):
    # Search by partial name
    matches = await lookup_candidate(name="Alex")
    assert isinstance(matches, list) and len(matches) >= 1
    assert matches[0].id == "CAND-001"

    # Search by exact email
    matches_email = await lookup_candidate(email="alex.rivera@example.com")
    assert len(matches_email) == 1
    assert matches_email[0].id == "CAND-001"

    # Search by ID as name
    matches_id = await lookup_candidate(name="CAND-002")
    assert len(matches_id) == 1
    assert matches_id[0].id == "CAND-002"

    # Empty identity input is safe and never expands to every candidate.
    err = await lookup_candidate()
    assert err == []

    # Unknown candidate returns empty list
    none_found = await lookup_candidate(name="NonExistentNameXYZ")
    assert none_found == []


@pytest.mark.asyncio
async def test_tool_get_candidate_context(agent_service):
    # Candidate not in repo
    res_unknown = await get_candidate_context("UNKNOWN-999")
    assert isinstance(res_unknown, FailedStatus)

    # Building state
    agent_service.reserve("CAND-001")
    res_building = await get_candidate_context("CAND-001")
    assert isinstance(res_building, BuildingStatus)

    # Failed state
    rev = agent_service.reserve("CAND-001")
    agent_service.registry.finish("CAND-001", rev, error="Simulated context error")
    res_failed = await get_candidate_context("CAND-001")
    assert isinstance(res_failed, FailedStatus)
    assert res_failed.error == "Simulated context error"

    # Ready state
    cand = agent_service.repository.get_candidate("CAND-001")
    await agent_service.build_context(cand)
    res_ready = await get_candidate_context("CAND-001")
    assert hasattr(res_ready, "candidate")
    assert res_ready.candidate.id == "CAND-001"


@pytest.mark.asyncio
async def test_tool_get_evidence_for_skill(agent_service):
    cand = agent_service.repository.get_candidate("CAND-001")
    await agent_service.build_context(cand)

    # Skill matching
    records = await get_evidence_for_skill("CAND-001", "Python")
    assert isinstance(records, list)
    assert len(records) > 0
    assert all("Python" in r.skill or r.skill.lower() == "python" for r in records)

    # Alias matching (e.g. React.js resolves to React)
    records_alias = await get_evidence_for_skill("CAND-001", "React.js")
    assert isinstance(records_alias, list)

    # Skill not present returns empty list
    records_none = await get_evidence_for_skill("CAND-001", "NonExistentSkill123")
    assert records_none == []


@pytest.mark.asyncio
async def test_tool_list_jobs(agent_service):
    jobs = await list_jobs()
    assert isinstance(jobs, list)
    assert len(jobs) >= 5
    assert all("id" in j and "title" in j for j in jobs)


@pytest.mark.asyncio
async def test_tool_get_jd_match(agent_service):
    cand = agent_service.repository.get_candidate("CAND-001")
    await agent_service.build_context(cand)

    match = await get_jd_match("CAND-001", "JOB-001")
    assert hasattr(match, "candidate_id")
    assert match.candidate_id == "CAND-001"
    assert match.job_id == "JOB-001"
    assert len(match.coverage) > 0

    # Job not found
    err_job = await get_jd_match("CAND-001", "NON-EXISTENT-JOB")
    assert "error" in err_job


# --- 2. Orchestrator ---

@pytest.mark.asyncio
async def test_orchestrator_single_turn_greeting_and_clarification(agent_service, monkeypatch):
    # Greeting passes through
    async def mock_greeting(prompt, system, temperature=0.0, max_tokens=2000):
        return "Hello! How can I help you evaluate candidates today?", ProviderName.GEMINI

    monkeypatch.setattr("backend.services.agent.orchestrator.generate_with_fallback", mock_greeting)
    resp = await run_agent_turn([], "Hello", None)
    assert resp.tool_calls_made == 0
    assert resp.provider_used == ProviderName.GEMINI
    assert "Hello!" in resp.assistant_message

    # Asking a general question without resolving candidate asks for clarification
    async def mock_unresolved(prompt, system, temperature=0.0, max_tokens=2000):
        return "He has extensive backend experience.", ProviderName.GEMINI

    monkeypatch.setattr("backend.services.agent.orchestrator.generate_with_fallback", mock_unresolved)
    resp2 = await run_agent_turn([], "Does he know Python?", None)
    assert "Please provide a candidate name or email" in resp2.assistant_message


@pytest.mark.asyncio
async def test_orchestrator_tool_call_execution(agent_service, monkeypatch):
    cand = agent_service.repository.get_candidate("CAND-001")
    await agent_service.build_context(cand)

    turn = 0
    async def mock_dialogue(prompt, system, temperature=0.0, max_tokens=2000):
        nonlocal turn
        turn += 1
        if turn == 1:
            # First turn: call lookup_candidate
            return json.dumps({
                "tool_call": {
                    "name": "lookup_candidate",
                    "arguments": {"name": "Alex Rivera"}
                }
            }), ProviderName.GEMINI
        elif turn == 2:
            # Second turn: fetch candidate context
            return json.dumps({
                "tool_call": {
                    "name": "get_candidate_context",
                    "arguments": {"candidate_id": "CAND-001"}
                }
            }), ProviderName.GEMINI
        else:
            # Third turn: provide answer citing candidate claim / evidence
            context = agent_service.registry.get("CAND-001").context
            evi_id = context.evidence_records[0].id
            return f"Alex Rivera has verified Python experience backed by {evi_id}.", ProviderName.GEMINI

    monkeypatch.setattr("backend.services.agent.orchestrator.generate_with_fallback", mock_dialogue)

    history = [ChatMessage(role="user", content="Tell me about Alex Rivera")]
    resp = await run_agent_turn(history, "What is his Python experience?", None)

    assert resp.tool_calls_made == 2
    assert resp.provider_used == ProviderName.GEMINI
    context = agent_service.registry.get("CAND-001").context
    evi_id = context.evidence_records[0].id
    assert evi_id in resp.grounding_ids
    assert evi_id in resp.assistant_message


@pytest.mark.asyncio
async def test_orchestrator_candidate_resolution_enforcement(agent_service, monkeypatch):
    # Verify that trying to call get_candidate_context without lookup_candidate fails safely
    turn = 0
    async def mock_bad_call(prompt, system, temperature=0.0, max_tokens=2000):
        nonlocal turn
        turn += 1
        if turn == 1:
            return json.dumps({
                "tool_call": {
                    "name": "get_candidate_context",
                    "arguments": {"candidate_id": "CAND-001"}
                }
            }), ProviderName.GEMINI
        return "Could not fetch context without resolution.", ProviderName.GEMINI

    monkeypatch.setattr("backend.services.agent.orchestrator.generate_with_fallback", mock_bad_call)
    resp = await run_agent_turn([], "Show me CAND-001 context directly", None)
    assert resp.tool_calls_made == 1


@pytest.mark.asyncio
async def test_orchestrator_five_iteration_cap(agent_service, monkeypatch):
    # LLM keeps emitting tool calls indefinitely
    call_count = 0
    async def mock_loop(prompt, system, temperature=0.0, max_tokens=2000):
        nonlocal call_count
        call_count += 1
        return json.dumps({
            "tool_call": {
                "name": "list_jobs",
                "arguments": {}
            }
        }), ProviderName.GROQ

    monkeypatch.setattr("backend.services.agent.orchestrator.generate_with_fallback", mock_loop)

    resp = await run_agent_turn([], "List jobs repeatedly", None)
    assert resp.tool_calls_made == 5
    assert call_count == 5
    assert resp.assistant_message == CAP_MESSAGE
    assert resp.grounding_ids == []


# --- 3. Brief Generator ---

@pytest.mark.asyncio
async def test_brief_generator_success_and_grounding(agent_service, monkeypatch):
    cand = agent_service.repository.get_candidate("CAND-001")
    await agent_service.build_context(cand)
    context = agent_service.registry.get("CAND-001").context
    claim_id = context.claims[0].id if context.claims else "CLM-CAND-001-001"
    evi_id = context.evidence_records[0].id

    sample_brief_text = f"""## Strengths
Demonstrated leadership in distributed backend architectures supported by {evi_id}.

## Evidence Summary
Public GitHub contributions confirm active Python development ({evi_id}).

## Application History Notes
No prior applications recorded with this organization.

## Identified Gaps
Unverified resume claim {claim_id} regarding cloud infrastructure scaling requires validation."""

    async def mock_generate(prompt, system, temperature=0.0, max_tokens=2000):
        assert temperature == 0.0
        return sample_brief_text, ProviderName.GEMINI

    monkeypatch.setattr("backend.services.agent.brief_generator.generate_with_fallback", mock_generate)

    brief = await generate_brief("CAND-001", "JOB-001", NOW.date())
    assert brief.candidate_id == "CAND-001"
    assert brief.job_id == "JOB-001"
    assert brief.provider_used == ProviderName.GEMINI
    assert evi_id in brief.strengths
    assert "Identified Gaps" not in brief.identified_gaps
    assert claim_id in brief.identified_gaps
    assert evi_id in brief.grounding_ids


@pytest.mark.asyncio
async def test_brief_generator_missing_section_fallback(agent_service, monkeypatch):
    cand = agent_service.repository.get_candidate("CAND-001")
    await agent_service.build_context(cand)
    context = agent_service.registry.get("CAND-001").context
    evi_id = context.evidence_records[0].id

    # Response missing 'Identified Gaps' section
    incomplete_brief = f"""## Strengths
Strong technical core supported by {evi_id}.

## Evidence Summary
Solid GitHub history backed by {evi_id}.

## Application History Notes
First time applicant."""

    async def mock_generate(prompt, system, temperature=0.0, max_tokens=2000):
        return incomplete_brief, ProviderName.GROQ

    monkeypatch.setattr("backend.services.agent.brief_generator.generate_with_fallback", mock_generate)

    brief = await generate_brief("CAND-001", None, NOW.date())
    assert evi_id in brief.strengths
    assert brief.identified_gaps == MISSING_SECTION


@pytest.mark.asyncio
async def test_brief_generator_context_not_ready(agent_service):
    # Context not built yet
    agent_service.reserve("CAND-002")
    with pytest.raises(ValueError, match="Context not ready"):
        await generate_brief("CAND-002", None, NOW.date())


# --- 4. Interview Question Generator ---

@pytest.mark.asyncio
async def test_question_generator_success(agent_service, monkeypatch):
    cand = agent_service.repository.get_candidate("CAND-001")
    await agent_service.build_context(cand)
    context = agent_service.registry.get("CAND-001").context

    # Pick an unverified claim
    unverified = next(c for c in context.claims if c.verification_state == "unverified")

    sample_questions = [
        {
            "question_text": "Can you describe your role in optimizing the distributed caching layer?",
            "target_type": "unverified_claim",
            "source_id": unverified.id,
            "rationale": f"Candidate declared experience with caching in claim {unverified.id} which remains unverified."
        }
    ]

    async def mock_generate(prompt, system, temperature=0.0, max_tokens=2000):
        assert temperature == 0.0
        return json.dumps(sample_questions), ProviderName.GEMINI

    monkeypatch.setattr("backend.services.agent.question_generator.generate_with_fallback", mock_generate)

    qset = await generate_interview_questions("CAND-001", "JOB-001", NOW.date())
    assert qset.candidate_id == "CAND-001"
    assert qset.job_id == "JOB-001"
    assert len(qset.questions) == 1
    q = qset.questions[0]
    assert q.source_id == unverified.id
    assert q.target_type == "unverified_claim"
    assert unverified.id in qset.grounding_ids


@pytest.mark.asyncio
async def test_question_generator_parse_failure(agent_service, monkeypatch):
    cand = agent_service.repository.get_candidate("CAND-001")
    await agent_service.build_context(cand)

    async def mock_invalid(prompt, system, temperature=0.0, max_tokens=2000):
        return "Not a valid JSON array", ProviderName.GEMINI

    monkeypatch.setattr("backend.services.agent.question_generator.generate_with_fallback", mock_invalid)

    qset = await generate_interview_questions("CAND-001", "JOB-001", NOW.date())
    assert qset.questions == []
    assert any("warning" in g for g in qset.grounding_ids)


@pytest.mark.asyncio
async def test_question_generator_validation_errors(agent_service):
    cand = agent_service.repository.get_candidate("CAND-001")
    await agent_service.build_context(cand)

    # Missing job_id
    with pytest.raises(ValueError, match="job_id required"):
        await generate_interview_questions("CAND-001", "", NOW.date())

    # Context not ready
    agent_service.reserve("CAND-002")
    with pytest.raises(ValueError, match="Context not ready"):
        await generate_interview_questions("CAND-002", "JOB-001", NOW.date())
