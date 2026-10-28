"""Read-only tools; request-local service selection supports isolated registries."""
from contextvars import ContextVar
from datetime import datetime, timezone
from functools import wraps
from pydantic import BaseModel, ConfigDict
from backend.services.context_builder import context_builder
from backend.services.taxonomy import resolve_skill
from backend.services.ranking_engine import build_match
from backend.services.match_store import match_store
from backend.models import CandidateSummary
from .models import BuildingStatus, FailedStatus

current_service = ContextVar('agent_context_builder', default=None)


def service():
    return current_service.get() or context_builder


def safe(handler):
    @wraps(handler)
    async def wrapped(*args, **kwargs):
        try:
            return await handler(*args, **kwargs)
        except Exception:
            return {'error': 'Tool could not complete the request'}
    return wrapped


class ToolArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')


class LookupCandidate(ToolArgs):
    name: str | None = None
    email: str | None = None


class GetCandidateContext(ToolArgs):
    candidate_id: str


class GetJDMatch(GetCandidateContext):
    job_id: str


class ListJobs(ToolArgs):
    pass


class GetEvidenceForSkill(GetCandidateContext):
    skill: str


@safe
async def lookup_candidate(name=None, email=None):
    name, email = (name or '').strip().casefold(), (email or '').strip().casefold()
    if not name and not email:
        return {'error': 'Provide a candidate name, ID, or email'}
    return [CandidateSummary.model_validate(c.model_dump()) for c in service().repository.all_candidate_details()
            if (not name or name in c.full_name.casefold() or name == c.id.casefold())
            and (not email or email == str(c.email).casefold())][:5]


@safe
async def get_candidate_context(candidate_id):
    if not service().repository.get_candidate(candidate_id):
        return {'error': 'Candidate not found'}
    entry = service().registry.get(candidate_id)
    if entry is None or entry.status == 'building':
        return BuildingStatus()
    if entry.status == 'failed':
        return FailedStatus(error=entry.error or 'Context build failed')
    return entry.context


def match_for(candidate_id, job_id, reference_date):
    entry = service().registry.get(candidate_id)
    if not entry or entry.status != 'ready':
        raise ValueError('Context not ready')
    job = service().repository.get_job(job_id)
    if job is None:
        raise ValueError('Job not found')
    result = match_store.get_result(job_id, candidate_id, reference_date, entry.revision)
    if result is None:
        result = build_match(job, candidate_id, entry.context, reference_date)
        match_store.store_result(result, entry.revision)
    return result


@safe
async def get_jd_match(candidate_id, job_id):
    context = await get_candidate_context(candidate_id)
    if not hasattr(context, 'candidate'):
        return context
    return match_for(candidate_id, job_id, datetime.now(timezone.utc).date())


@safe
async def list_jobs():
    return [{'id': job.id, 'title': job.title} for job in service().repository.get_jobs()]


@safe
async def get_evidence_for_skill(candidate_id, skill):
    context = await get_candidate_context(candidate_id)
    return [r for r in getattr(context, 'evidence_records', []) if resolve_skill(r.skill) == resolve_skill(skill)]


TOOLS = {
    'lookup_candidate': (LookupCandidate, lookup_candidate),
    'get_candidate_context': (GetCandidateContext, get_candidate_context),
    'get_jd_match': (GetJDMatch, get_jd_match),
    'list_jobs': (ListJobs, list_jobs),
    'get_evidence_for_skill': (GetEvidenceForSkill, get_evidence_for_skill),
}
TOOL_DEFINITIONS = [{'type': 'function', 'function': {'name': name,
    'description': name.replace('_', ' '), 'parameters': schema.model_json_schema()}}
    for name, (schema, _) in TOOLS.items()]
