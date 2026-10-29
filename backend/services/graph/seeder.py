import logging
from backend.services.taxonomy import resolve_skill
from backend.services.requirement_extractor import requirements_for_job
from backend.services.ranking_engine import build_match
from .neo4j_client import get_graph_client

logger = logging.getLogger(__name__)


async def seed_candidate_graph(candidate_id, context, job_id=None, *, repository=None):
    try:
        client = get_graph_client()
        if not client.enabled:
            return False
        skills = sorted({resolve_skill(r.skill) for r in [*context.claims, *context.evidence_records] if r.skill})
        records = [{'id': candidate_id + ':' + str(r.source_url), 'url': str(r.source_url),
                    'skill': resolve_skill(r.skill)} for r in context.evidence_records]
        rows = await client.query('''MERGE (c:Candidate {id:$candidate_id}) SET c.name=$name
            WITH c UNWIND $skills AS skill
            MERGE (s:Skill {id:skill}) SET s.name=skill MERGE (c)-[:HAS_SKILL]->(s)
            RETURN c.id AS id''', candidate_id=candidate_id, name=context.candidate.full_name, skills=skills)
        if rows is None:
            return False
        rows = await client.query('''MATCH (c:Candidate {id:$candidate_id}) UNWIND $records AS record
            MERGE (r:Repository {id:record.id}) SET r.url=record.url,r.candidate_id=$candidate_id
            MERGE (s:Skill {id:record.skill})
            MERGE (c)-[:CONTRIBUTED_TO]->(r) MERGE (r)-[:DEMONSTRATES]->(s)
            RETURN r.id AS id''', candidate_id=candidate_id, records=records)
        if rows is None:
            return False
        if job_id:
            if repository is None:
                from backend.services.seed_loader import seed_loader
                repository = seed_loader
            job = repository.get_job(job_id)
            if job is None:
                return False
            match = build_match(job, candidate_id, context, context.reference_date)
            matched = {r.requirement_id for r in match.coverage if r.coverage_state == 'matched'}
            requirements = [{'id': candidate_id + ':' + r.id, 'source_id': r.id,
                'skills': [s for s in r.skill_aliases if resolve_skill(s) in skills]}
                for r in requirements_for_job(job) if r.id in matched]
            rows = await client.query('''MATCH (c:Candidate {id:$candidate_id})
                MERGE (j:Job {id:$graph_job_id}) SET j.job_id=$job_id,j.title=$title,j.candidate_id=$candidate_id
                MERGE (c)-[:APPLIED_FOR]->(j)
                WITH j UNWIND $requirements AS requirement
                MERGE (r:Requirement {id:requirement.id}) SET r.source_id=requirement.source_id,r.candidate_id=$candidate_id
                MERGE (j)-[:REQUIRES]->(r)
                WITH r,requirement UNWIND requirement.skills AS skill
                MERGE (s:Skill {id:skill}) MERGE (s)-[:COVERS]->(r)
                RETURN r.id AS id''', candidate_id=candidate_id, graph_job_id=candidate_id + ':' + job_id,
                job_id=job_id, title=job.title, requirements=requirements)
            if rows is None:
                return False
        return True
    except Exception:
        logger.warning('Graph seeding failed candidate=%s', candidate_id)
        return False
