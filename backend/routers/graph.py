from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from backend.routers.ingest import get_context_builder
from backend.routers.candidates import find_candidate
from backend.routers.jd import find_job
from backend.services.graph.neo4j_client import CandidateSubgraph, GraphEdge, GraphNode, JobScope, get_graph_client
from backend.services.ranking_engine import build_match
from backend.services.requirement_extractor import requirements_for_job
from backend.services.taxonomy import resolve_skill
from backend.core.dependencies import require_role
from backend.core.roles import Role
from backend.core.workspace import workspace_of

router = APIRouter(tags=['Knowledge graph'])


class SkillRequest(BaseModel):
    skill: str = Field(min_length=1)

    @field_validator('skill')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('skill must not be blank')
        return value.strip()


def job_overlay(graph: CandidateSubgraph, candidate_id, job, entry) -> CandidateSubgraph:
    """Add the selected job's requirements to the graph (OI-22).

    Coverage comes from build_match, the calculation JD Match uses, so the graph
    cannot disagree with it. Nothing here is persisted: a candidate is not
    associated with a job (OI-30), so the edge is CONSIDERED_FOR, not APPLIED_FOR.
    """
    if entry is None or entry.status != 'ready' or entry.context is None:
        status = 'context_failed' if entry is not None and entry.status == 'failed' else 'context_building'
        return graph.model_copy(update={'job_scope': JobScope(job_id=job.id, title=job.title, status=status)})
    context = entry.context
    match = build_match(job, candidate_id, context, datetime.now(timezone.utc).date())
    coverage = {item.requirement_id: item for item in match.coverage}
    claims = {claim.id: claim for claim in context.claims}
    records = {record.id: record for record in context.evidence_records}
    skill_ids = {node.id for node in graph.nodes if node.label == 'Skill'}
    job_node = f'job:{job.id}'
    nodes = [*graph.nodes, GraphNode(id=job_node, label='Job', properties={'job_id': job.id, 'title': job.title})]
    edges = [*graph.edges, GraphEdge(source_id=candidate_id, target_id=job_node, relationship='CONSIDERED_FOR')]
    for requirement in requirements_for_job(job):
        item = coverage.get(requirement.id)
        node_id = f'{job_node}:{requirement.id}'
        nodes.append(GraphNode(id=node_id, label='Requirement', properties={
            'requirement_id': requirement.id, 'name': requirement.requirement_text,
            'is_mandatory': requirement.is_mandatory,
            'coverage_state': item.coverage_state.value if item else 'not_assessed',
            'observation': item.observation if item else None}))
        edges.append(GraphEdge(source_id=job_node, target_id=node_id, relationship='REQUIRES'))
        if item is None:
            continue
        linked = {resolve_skill(claims[i].skill) for i in item.claim_ids if i in claims and claims[i].skill}
        linked |= {resolve_skill(records[i].skill) for i in item.evidence_record_ids if i in records}
        edges.extend(GraphEdge(source_id=skill, target_id=node_id, relationship='SUPPORTS')
                     for skill in sorted(linked & skill_ids))
    return CandidateSubgraph(nodes=nodes, edges=edges,
                             job_scope=JobScope(job_id=job.id, title=job.title, status='included'))


@router.get('/candidates/{candidate_id}/graph', response_model=CandidateSubgraph)
async def graph(candidate_id: str, job_id: str | None = Query(default=None, min_length=1),
                service=Depends(get_context_builder),
                user=Depends(require_role(Role.recruiter, Role.hiring_manager, Role.hr_admin))):
    workspace = workspace_of(user)
    find_candidate(service, candidate_id, workspace)
    job = find_job(service, job_id, workspace) if job_id else None
    result = await get_graph_client().get_candidate_subgraph(candidate_id, report_unavailable=True)
    if result is None:
        raise HTTPException(503, 'Graph unavailable')
    if job is not None:
        result = job_overlay(result, candidate_id, job, service.registry.get(candidate_id))
    return result


@router.post('/candidates/{candidate_id}/graph-evidence')
async def evidence(candidate_id: str, body: SkillRequest, service=Depends(get_context_builder), user=Depends(require_role(Role.recruiter, Role.hiring_manager, Role.hr_admin))):
    find_candidate(service, candidate_id, workspace_of(user))
    result = await get_graph_client().graph_evidence_for_skill(candidate_id, body.skill, report_unavailable=True)
    if result is None:
        raise HTTPException(503, 'Graph unavailable')
    return result
