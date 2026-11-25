"""Write a candidate's knowledge graph from a built context.

Graph model (OI-21): what the graph asserts is limited to what the sources say.

    (Candidate)-[:CLAIMS]->(Skill)                 skill named in a resume claim
    (Candidate)-[:HAS_SOURCE]->(Source)            GitHub / LinkedIn / LeetCode signal source
    (Source)-[:LISTS]->(Project)                   public repository found on that source
    (Project|Source)-[:INDICATES]->(Skill)         observation text is kept on the relationship

Nothing in the graph asserts authorship or contribution: a listed repository is
only an observation about a public project.

Reconciliation (OI-20): each seed replaces the candidate's whole graph inside
one write transaction, so skills/projects absent from the new context are
removed. The candidate node carries the build time of the context it was
written from, and a seed for an older context is rejected inside the same
transaction, so overlapping builds cannot leave an older graph in place.
"""
import logging
from collections import defaultdict
from urllib.parse import urlparse

from backend.services.taxonomy import resolve_skill
from .neo4j_client import get_graph_client

logger = logging.getLogger(__name__)

SOURCE_NAMES = {'github': 'GitHub', 'linkedin': 'LinkedIn', 'leetcode': 'LeetCode'}


class StaleGraphWrite(Exception):
    """A newer context has already been written for this candidate."""


def _kind(record):
    value = getattr(record.source_type, 'value', record.source_type)
    return str(value).lower()


def _project_name(url):
    parts = [part for part in urlparse(url).path.split('/') if part]
    # github.com/owner/repo -> owner/repo; other hosts fall back to the last two path segments.
    return '/'.join(parts[-2:]) if parts else url


def _profile_url(candidate, kind):
    value = getattr(candidate, kind, None)
    if not value:
        return None
    if value.startswith('http'):
        return value
    return {'github': f'https://github.com/{value}', 'leetcode': f'https://leetcode.com/u/{value}/'}.get(kind)


def build_graph_spec(candidate_id, context):
    """Pure description of the candidate's graph; seeded as-is and unit tested."""
    claims = sorted({resolve_skill(claim.skill) for claim in context.claims if claim.skill})
    sources, projects = {}, {}
    indications = defaultdict(list)
    for record in context.evidence_records:
        kind = _kind(record)
        skill = resolve_skill(record.skill)
        source_id = f'{candidate_id}:source:{kind}'
        provenance = str(getattr(record.provenance, 'value', record.provenance))
        source = sources.setdefault(source_id, {'id': source_id, 'props': {
            'candidate_id': candidate_id, 'kind': kind, 'name': SOURCE_NAMES.get(kind, kind.title()),
            'url': _profile_url(context.candidate, kind), 'synthetic': True}})
        source['props']['synthetic'] = source['props']['synthetic'] and provenance.startswith('synthetic')
        url = str(record.source_url)
        if kind == 'github':
            project_id = f'{candidate_id}:project:{url}'
            projects.setdefault(project_id, {'id': project_id, 'source_id': source_id, 'props': {
                'candidate_id': candidate_id, 'name': _project_name(url), 'url': url, 'source': kind}})
            origin = ('Project', project_id)
        else:
            origin = ('Source', source_id)
        observations = indications[(origin, skill)]
        if record.observation not in observations:
            observations.append(record.observation)
    def rows(label):
        return [{'from_id': origin_id, 'skill': skill, 'observations': observations}
                for ((origin_label, origin_id), skill), observations in sorted(indications.items())
                if origin_label == label]
    return {'claims': claims, 'sources': sorted(sources.values(), key=lambda s: s['id']),
            'projects': sorted(projects.values(), key=lambda p: p['id']),
            'project_indications': rows('Project'), 'source_indications': rows('Source')}


def _stamp(context):
    built_at = getattr(context, 'context_built_at', None)
    return int(built_at.timestamp() * 1000) if built_at else 0


async def _write(tx, candidate_id, context, spec, revision):
    stamp = _stamp(context)
    result = await tx.run('MATCH (c:Candidate {id:$candidate_id}) RETURN c.graph_built_at AS built_at',
                          {'candidate_id': candidate_id})
    existing = [row.get('built_at') for row in await result.data()]
    if any(value is not None and value > stamp for value in existing):
        raise StaleGraphWrite(candidate_id)
    statements = [
        ('MATCH (n) WHERE n.candidate_id = $candidate_id DETACH DELETE n', {}),
        ('MATCH (c:Candidate {id:$candidate_id})-[r]-() DELETE r', {}),
        ('''MERGE (c:Candidate {id:$candidate_id})
            SET c.name=$name, c.workspace_id=$workspace_id, c.graph_built_at=$stamp, c.graph_revision=$revision''',
         {'name': context.candidate.full_name, 'workspace_id': context.candidate.workspace_id or 'default',
          'stamp': stamp, 'revision': revision}),
        ('''MATCH (c:Candidate {id:$candidate_id}) UNWIND $claims AS skill
            MERGE (s:Skill {id:skill}) SET s.name=skill MERGE (c)-[:CLAIMS]->(s)''', {'claims': spec['claims']}),
        ('''MATCH (c:Candidate {id:$candidate_id}) UNWIND $sources AS source
            CREATE (n:Source {id:source.id}) SET n += source.props CREATE (c)-[:HAS_SOURCE]->(n)''',
         {'sources': spec['sources']}),
        ('''UNWIND $projects AS project MATCH (s:Source {id:project.source_id})
            CREATE (n:Project {id:project.id}) SET n += project.props CREATE (s)-[:LISTS]->(n)''',
         {'projects': spec['projects']}),
        ('''UNWIND $rows AS row MATCH (n:Project {id:row.from_id})
            MERGE (s:Skill {id:row.skill}) SET s.name=row.skill
            CREATE (n)-[:INDICATES {observations:row.observations}]->(s)''', {'rows': spec['project_indications']}),
        ('''UNWIND $rows AS row MATCH (n:Source {id:row.from_id})
            MERGE (s:Skill {id:row.skill}) SET s.name=row.skill
            CREATE (n)-[:INDICATES {observations:row.observations}]->(s)''', {'rows': spec['source_indications']}),
        ('MATCH (s:Skill) WHERE NOT (s)--() DELETE s', {}),
    ]
    for cypher, params in statements:
        await tx.run(cypher, {'candidate_id': candidate_id, **params})
    return True


async def seed_candidate_graph(candidate_id, context, *, revision=None):
    """Replace the candidate's graph with one built from ``context``.

    Returns False when the graph is disabled, unavailable, or a newer context
    was already written. Never raises: graph seeding must not fail a build.
    """
    try:
        client = get_graph_client()
        if not client.enabled:
            return False
        spec = build_graph_spec(candidate_id, context)
        return bool(await client.execute_write(_write, candidate_id, context, spec, revision))
    except StaleGraphWrite:
        logger.info('Graph seed skipped for an older context candidate=%s', candidate_id)
        return False
    except Exception:
        logger.warning('Graph seeding failed candidate=%s', candidate_id)
        return False
