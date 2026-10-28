from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from backend.routers.ingest import get_context_builder
from backend.routers.candidates import find_candidate
from backend.services.graph.neo4j_client import get_graph_client

router = APIRouter(tags=['Knowledge graph'])


class SkillRequest(BaseModel):
    skill: str = Field(min_length=1)

    @field_validator('skill')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('skill must not be blank')
        return value.strip()


@router.get('/candidates/{candidate_id}/graph')
async def graph(candidate_id: str, service=Depends(get_context_builder)):
    find_candidate(service, candidate_id)
    result = await get_graph_client().get_candidate_subgraph(candidate_id, report_unavailable=True)
    if result is None:
        raise HTTPException(503, 'Graph unavailable')
    return result


@router.post('/candidates/{candidate_id}/graph-evidence')
async def evidence(candidate_id: str, body: SkillRequest, service=Depends(get_context_builder)):
    find_candidate(service, candidate_id)
    result = await get_graph_client().graph_evidence_for_skill(candidate_id, body.skill, report_unavailable=True)
    if result is None:
        raise HTTPException(503, 'Graph unavailable')
    return result
