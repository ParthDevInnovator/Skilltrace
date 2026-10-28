from typing import Literal
from pydantic import BaseModel, Field, AwareDatetime
from backend.services.llm import ProviderName


class ChatMessage(BaseModel):
    role: Literal['user', 'assistant', 'tool']
    content: str
    tool_call_id: str | None = None


class AgentResponse(BaseModel):
    assistant_message: str
    tool_calls_made: int
    provider_used: ProviderName
    grounding_ids: list[str] = Field(default_factory=list)


class CandidateBrief(BaseModel):
    candidate_id: str
    job_id: str | None
    generated_at: AwareDatetime
    provider_used: ProviderName
    strengths: str
    evidence_summary: str
    application_history_notes: str
    identified_gaps: str
    grounding_ids: list[str]


class InterviewQuestion(BaseModel):
    question_text: str = Field(min_length=1)
    target_type: Literal['unverified_claim', 'coverage_gap', 'history_probe']
    source_id: str
    rationale: str = Field(min_length=1)


class InterviewQuestionSet(BaseModel):
    candidate_id: str
    job_id: str
    generated_at: AwareDatetime
    provider_used: ProviderName
    questions: list[InterviewQuestion]
    grounding_ids: list[str]


class BuildingStatus(BaseModel):
    status: Literal['building'] = 'building'


class FailedStatus(BaseModel):
    status: Literal['failed'] = 'failed'
    error: str = 'Context build failed'
