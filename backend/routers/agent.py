from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from backend.routers.ingest import get_context_builder
from backend.routers.candidates import find_candidate
from backend.routers.jd import find_job
from backend.services.agent.models import ChatMessage
from backend.services.agent.tools import current_service
from backend.services.agent.orchestrator import run_agent_turn
from backend.services.agent.brief_generator import generate_brief
from backend.services.agent.question_generator import generate_interview_questions
from backend.services.llm import LLMProviderError

router = APIRouter(tags=['AI assistance'])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20000)
    history: list[ChatMessage] = Field(default_factory=list)
    job_id: str | None = None

    @field_validator('message')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('message must not be blank')
        return value.strip()

    @field_validator('history')
    @classmethod
    def recent_history(cls, value):
        return value[-20:]


class BriefRequest(BaseModel):
    job_id: str | None = None
    reference_date: date | None = None

    def date(self):
        return self.reference_date or datetime.now(timezone.utc).date()


class QuestionsRequest(BriefRequest):
    job_id: str = Field(min_length=1)


async def invoke(service, function, *args):
    token = current_service.set(service)
    try:
        return await function(*args)
    except LLMProviderError as exc:
        return JSONResponse(status_code=503, content={'detail': 'AI providers unavailable',
            'provider_errors': exc.provider_errors or [exc.as_dict()]})
    finally:
        current_service.reset(token)


def context_status(service, candidate_id, job_id):
    find_candidate(service, candidate_id)
    if job_id is not None:
        find_job(service, job_id)
    entry = service.registry.get(candidate_id)
    if entry is None:
        revision = service.reserve(candidate_id)
        service.launch(candidate_id, revision)
        return JSONResponse(status_code=202, content={'status': 'building'})
    if entry.status == 'building':
        return JSONResponse(status_code=202, content={'status': 'building'})
    if entry.status == 'failed':
        raise HTTPException(503, entry.error or 'Context build failed')


@router.post('/agent/chat')
async def chat(body: ChatRequest, service=Depends(get_context_builder)):
    if body.job_id:
        find_job(service, body.job_id)
    return await invoke(service, run_agent_turn, body.history, body.message, body.job_id)


@router.post('/candidates/{candidate_id}/brief')
async def brief(candidate_id: str, body: BriefRequest, service=Depends(get_context_builder)):
    status = context_status(service, candidate_id, body.job_id)
    return status if status is not None else await invoke(service, generate_brief, candidate_id, body.job_id, body.date())


@router.post('/candidates/{candidate_id}/interview-questions')
async def questions(candidate_id: str, body: QuestionsRequest, service=Depends(get_context_builder)):
    status = context_status(service, candidate_id, body.job_id)
    return status if status is not None else await invoke(service, generate_interview_questions, candidate_id, body.job_id, body.date())
