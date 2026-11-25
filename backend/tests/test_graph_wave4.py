"""Wave 4 graph fixes: OI-20 (reconciliation), OI-21 (attribution), OI-22 (job scope)."""
from datetime import date, timedelta

import httpx
import pytest

from backend.main import app
from backend.models import EvidenceProvenance
from backend.services.graph import seeder
from backend.services.graph.neo4j_client import CandidateSubgraph, Neo4jClient
from backend.services.graph.seeder import build_graph_spec
from backend.services.signal_fetchers.common import make_record
from backend.tests.test_context_api import api_service  # noqa: F401 - fixture


def _record(skill, source_type, url, observation):
    return make_record(candidate_id='CAND-001', skill=skill, source_type=source_type, source_url=url,
                       observation=observation, base_weight=1, observed=None, reference_date=date(2026, 1, 1),
                       provenance=EvidenceProvenance.LIVE)


async def _context(service):
    context = await service.build_context(service.repository.get_candidate('CAND-001'))
    return context.model_copy(update={'evidence_records': [
        _record('Python', 'github', 'https://github.com/octo/widgets', 'Public repository octo/widgets lists Python.'),
        _record('Docker', 'github', 'https://github.com/octo/widgets', 'Public repository octo/widgets declares topic docker.'),
        _record('Go', 'leetcode', 'https://leetcode.com/u/octo/', 'Public LeetCode statistics report 12 solved problems in Go.'),
    ]})


class FakeTx:
    def __init__(self, built_at=None):
        self.built_at, self.calls = built_at, []

    async def run(self, cypher, params):
        self.calls.append((cypher, params))
        rows = [{'built_at': self.built_at}] if 'RETURN c.graph_built_at' in cypher and self.built_at else []

        class Result:
            async def data(self):
                return rows
        return Result()


class FakeClient:
    enabled = True

    def __init__(self, tx):
        self.tx = tx

    async def execute_write(self, work, *args):
        return await work(self.tx, *args)


@pytest.mark.asyncio
async def test_graph_spec_models_sources_without_asserting_authorship(api_service, monkeypatch):
    service, _ = api_service
    context = await _context(service)
    spec = build_graph_spec('CAND-001', context)
    # OI-21: GitHub repositories are projects listed on a source, with readable names.
    assert [p['props']['name'] for p in spec['projects']] == ['octo/widgets']
    assert {s['props']['name'] for s in spec['sources']} == {'GitHub', 'LeetCode'}
    assert all(s['props']['synthetic'] is False for s in spec['sources'])
    # LeetCode does not become a project; it indicates the skill directly.
    assert spec['source_indications'] == [{'from_id': 'CAND-001:source:leetcode', 'skill': 'Go',
        'observations': ['Public LeetCode statistics report 12 solved problems in Go.']}]
    assert {row['skill'] for row in spec['project_indications']} == {'Python', 'Docker'}
    tx = FakeTx()
    monkeypatch.setattr(seeder, 'get_graph_client', lambda: FakeClient(tx))
    assert await seeder.seed_candidate_graph('CAND-001', context) is True
    cypher = ' '.join(c for c, _ in tx.calls)
    assert 'CONTRIBUTED_TO' not in cypher and 'DEMONSTRATES' not in cypher and 'Repository' not in cypher


@pytest.mark.asyncio
async def test_seed_replaces_candidate_graph_in_one_transaction(api_service, monkeypatch):
    """OI-20: each seed clears the candidate's previous graph before writing the new
    one, inside a single write transaction, and removes orphaned skills."""
    service, _ = api_service
    context = await _context(service)
    tx = FakeTx()
    monkeypatch.setattr(seeder, 'get_graph_client', lambda: FakeClient(tx))
    assert await seeder.seed_candidate_graph('CAND-001', context, revision='rev-2') is True
    cypher = [c for c, _ in tx.calls]
    delete_scoped = next(i for i, c in enumerate(cypher) if 'n.candidate_id = $candidate_id DETACH DELETE' in c)
    delete_edges = next(i for i, c in enumerate(cypher) if '-[r]-() DELETE r' in c)
    first_write = next(i for i, c in enumerate(cypher) if 'MERGE (c:Candidate' in c)
    assert delete_scoped < first_write and delete_edges < first_write
    assert 'NOT (s)--()' in cypher[-1]
    stamp = next(p for c, p in tx.calls if 'MERGE (c:Candidate' in c)
    assert stamp['revision'] == 'rev-2'
    assert stamp['stamp'] == int(context.context_built_at.timestamp() * 1000)
    # A replacement without Docker writes no Docker rows; the old edge went with the delete.
    replaced = context.model_copy(update={'evidence_records': context.evidence_records[:1]})
    tx.calls.clear()
    assert await seeder.seed_candidate_graph('CAND-001', replaced) is True
    rows = [row for c, p in tx.calls if 'INDICATES' in c for row in p['rows']]
    assert {row['skill'] for row in rows} == {'Python'}


@pytest.mark.asyncio
async def test_seed_for_older_context_is_rejected_before_any_write(api_service, monkeypatch):
    service, _ = api_service
    context = await _context(service)
    newer = int((context.context_built_at + timedelta(minutes=1)).timestamp() * 1000)
    tx = FakeTx(built_at=newer)
    monkeypatch.setattr(seeder, 'get_graph_client', lambda: FakeClient(tx))
    assert await seeder.seed_candidate_graph('CAND-001', context) is False
    assert len(tx.calls) == 1 and 'RETURN c.graph_built_at' in tx.calls[0][0]


@pytest.mark.asyncio
async def test_superseded_build_does_not_seed(api_service, monkeypatch):
    service, _ = api_service
    context = await _context(service)
    calls = []

    async def seed(candidate_id, ctx, *, revision=None):
        calls.append(revision)
        return True
    monkeypatch.setattr(seeder, 'seed_candidate_graph', seed)
    current = service.registry.get('CAND-001').revision
    await service._seed_graph('CAND-001', 'old-revision', context)
    await service._seed_graph('CAND-001', current, context)
    assert calls == [current]


@pytest.mark.asyncio
async def test_graph_job_overlay_matches_jd_match(api_service, monkeypatch):
    """OI-22: a job-scoped graph adds the job's requirements with JD Match's coverage."""
    service, _ = api_service
    await service.build_context(service.repository.get_candidate('CAND-001'))
    job = service.repository.get_jobs()[0]
    context = service.registry.get('CAND-001').context
    skills = sorted({r.canonical_skill for r in [*context.claims, *context.evidence_records] if r.canonical_skill})

    class Available:
        async def get_candidate_subgraph(self, *_args, **_kwargs):
            return CandidateSubgraph(nodes=[{'id': 'CAND-001', 'label': 'Candidate', 'properties': {}},
                *({'id': s, 'label': 'Skill', 'properties': {'name': s}} for s in skills)])
    monkeypatch.setattr('backend.routers.graph.get_graph_client', lambda: Available())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        plain = (await client.get('/api/v1/candidates/CAND-001/graph')).json()
        scoped = (await client.get(f'/api/v1/candidates/CAND-001/graph?job_id={job.id}')).json()
        match = (await client.post('/api/v1/candidates/CAND-001/jd-match', json={'job_id': job.id})).json()
        missing = await client.get('/api/v1/candidates/CAND-001/graph?job_id=NOPE')
    assert plain['job_scope'] is None and {n['label'] for n in plain['nodes']} == {'Candidate', 'Skill'}
    assert scoped['job_scope'] == {'job_id': job.id, 'title': job.title, 'status': 'included'}
    states = {n['properties']['requirement_id']: n['properties']['coverage_state']
              for n in scoped['nodes'] if n['label'] == 'Requirement'}
    assert states == {c['requirement_id']: c['coverage_state'] for c in match['coverage']}
    assert {'source_id': 'CAND-001', 'target_id': f'job:{job.id}', 'relationship': 'CONSIDERED_FOR'} in scoped['edges']
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_graph_job_overlay_reports_unready_context(api_service, monkeypatch):
    service, _ = api_service
    service.reserve('CAND-001')
    job = service.repository.get_jobs()[0]

    class Available:
        async def get_candidate_subgraph(self, *_args, **_kwargs):
            return CandidateSubgraph()
    monkeypatch.setattr('backend.routers.graph.get_graph_client', lambda: Available())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        response = await client.get(f'/api/v1/candidates/CAND-001/graph?job_id={job.id}')
        body = response.json()
    assert body['job_scope']['status'] == 'context_building' and body['nodes'] == []


@pytest.mark.asyncio
async def test_legacy_nodes_are_hidden_from_reads(monkeypatch):
    client = Neo4jClient(driver=object())

    async def query(*_, **__):
        return [{'nodes': [{'id': 'CAND-001', 'label': 'Candidate', 'properties': {}},
                           {'id': 'CAND-001:https://x', 'label': 'Repository', 'properties': {}}],
                 'edges': [{'source_id': 'CAND-001', 'target_id': 'CAND-001:https://x',
                            'relationship': 'CONTRIBUTED_TO'}]}]
    monkeypatch.setattr(client, 'query', query)
    graph = await client.get_candidate_subgraph('CAND-001')
    assert [n.label for n in graph.nodes] == ['Candidate'] and graph.edges == []
