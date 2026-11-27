"""JD APIs: existing structured requirements bypass the extractor."""
from datetime import date, datetime, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from backend.core.database import get_db
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from backend.routers.ingest import get_context_builder
from backend.models.matching import ExtractedRequirement, RankedCandidate, SimilarJob
from backend.services.requirement_extractor import extract_requirements, requirements_for_job
from backend.services.ranking_engine import rank_with_results, build_match, find_similar_jobs
from backend.services.match_store import match_store
from backend.core.dependencies import require_role
from backend.core.roles import Role
from backend.core.workspace import in_workspace, workspace_of
router = APIRouter(tags=['JD matching'])
class ExtractRequest(BaseModel):
    job_id: str | None = None
    jd_text: str | None = Field(default=None, max_length=100_000)
class JobRequest(BaseModel):
    job_id: str = Field(min_length=1)
    reference_date: date | None = None
    # "applicants": only candidates added to the job (OI-30). "pool": every candidate in the workspace.
    scope: Literal['pool', 'applicants'] = 'pool'
    def date(self):
        return self.reference_date or datetime.now(timezone.utc).date()
def find_job(service, id, workspace_id=None):
    job = service.repository.get_job(id)
    if job is None or (workspace_id is not None and not in_workspace(job, workspace_id)):
        raise HTTPException(404,'Job not found.')
    return job
@router.post('/extract', response_model=list[ExtractedRequirement])
def extract(body: ExtractRequest, service=Depends(get_context_builder), user=Depends(require_role(Role.recruiter, Role.hr_admin))):
    # Never re-extract an existing structured job, even if jd_text is supplied.
    if body.job_id is not None: return requirements_for_job(find_job(service,body.job_id,workspace_of(user)))
    if not body.jd_text or len(body.jd_text.strip()) < 50: raise HTTPException(422,'Provide a job_id or at least 50 characters of jd_text.')
    return extract_requirements(body.jd_text,'CUSTOM')
@router.post('/rank', response_model=list[RankedCandidate])
async def rank(body: JobRequest, service=Depends(get_context_builder), user=Depends(require_role(Role.recruiter, Role.hr_admin)),
               db: AsyncSession = Depends(get_db)):
    workspace = workspace_of(user)
    job = find_job(service,body.job_id,workspace)
    candidates = {c.id:c for c in service.repository.all_candidate_details() if in_workspace(c, workspace)}
    if body.scope == 'applicants':
        from backend.services.job_membership import applicants
        members = {row.candidate_id for row in (await applicants(db,[job.id],workspace)).get(job.id,[])}
        candidates = {id:c for id,c in candidates.items() if id in members}
    entries = {id:service.registry.get(id) for id in candidates}
    rows, results = await run_in_threadpool(rank_with_results,job,entries,body.date(),candidates)
    for result in results:
        entry = entries[result.candidate_id]
        if entry and entry.status=='ready':
            result.result_built_at = datetime.now(timezone.utc)
            match_store.store_result(result,entry.revision)
    return rows
@router.post('/similar', response_model=list[SimilarJob])
def similar(body: JobRequest, service=Depends(get_context_builder), user=Depends(require_role(Role.recruiter, Role.hr_admin))):
    workspace = workspace_of(user)
    return find_similar_jobs(find_job(service,body.job_id,workspace),
                             [job for job in service.repository.get_jobs() if in_workspace(job, workspace)])
async def candidate_match(candidate_id, body, service, workspace_id=None):
    candidate = service.repository.get_candidate(candidate_id)
    if candidate is None or (workspace_id is not None and not in_workspace(candidate, workspace_id)):
        raise HTTPException(404,'Candidate not found.')
    job = find_job(service,body.job_id,workspace_id)
    entry = service.registry.get(candidate.id)
    if entry is None:
        revision = service.reserve(candidate.id)
        service.launch(candidate.id,revision)
        entry = service.registry.get(candidate.id)
    if entry.status=='building': return JSONResponse(status_code=202,content={'status':'building'},headers={'Retry-After':'3'})
    if entry.status=='failed': return JSONResponse(status_code=503,content={'status':'failed','error':entry.error or 'Context build failed.'})
    reference = body.date()
    cached = match_store.get_result(job.id,candidate.id,reference,entry.revision)
    if cached: return cached
    result = build_match(job,candidate.id,entry.context,reference)
    result.result_built_at = datetime.now(timezone.utc)
    match_store.store_result(result,entry.revision)
    return result
