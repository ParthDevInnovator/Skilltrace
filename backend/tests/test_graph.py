import httpx
import pytest

from backend.main import app
from backend.services.graph.neo4j_client import Neo4jClient, CandidateSubgraph
from backend.services.graph.seeder import seed_candidate_graph
from backend.tests.test_context_api import api_service


@pytest.mark.asyncio
async def test_subgraph_projection_and_parameterization(monkeypatch):
    client = Neo4jClient(driver=object())
    calls = []
    async def query(cypher, **params):
        calls.append((cypher, params))
        return [{'nodes': [{'id': 'CAND-001', 'label': 'Candidate', 'properties': {'name': 'Alex'}},
                           {'id': 'python', 'label': 'Skill', 'properties': {'name': 'Python'}}],
                 'edges': [{'source_id': 'CAND-001', 'target_id': 'python', 'relationship': 'HAS_SKILL'}]}]
    monkeypatch.setattr(client, 'query', query)
    graph = await client.get_candidate_subgraph('CAND-001')
    assert [n.label for n in graph.nodes] == ['Candidate', 'Skill']
    assert graph.edges[0].relationship == 'HAS_SKILL'
    assert calls[0][1] == {'candidate_id': 'CAND-001'} and '$candidate_id' in calls[0][0]


@pytest.mark.asyncio
async def test_graph_skill_filter_and_connection_failure(monkeypatch):
    client = Neo4jClient(driver=object())
    async def rows(*_, **params):
        assert params['skill'] == 'Python'
        return [{'node': {'id': 'repo-1', 'label': 'Repository', 'properties': {'url': 'https://example.test'}}}]
    monkeypatch.setattr(client, 'query', rows)
    result = await client.graph_evidence_for_skill('CAND-001', 'python')
    assert len(result) == 1 and result[0].label == 'Repository'
    monkeypatch.setattr(client, 'query', lambda *_args, **_kwargs: fail())
    async def unavailable(*_, **__): return None
    monkeypatch.setattr(client, 'query', unavailable)
    assert await client.get_candidate_subgraph('CAND-001') == CandidateSubgraph()
    assert await client.graph_evidence_for_skill('CAND-001', 'Python') == []


async def fail():
    raise RuntimeError('unreachable')


@pytest.mark.asyncio
async def test_graph_endpoint_disabled_unknown_and_validation(api_service, monkeypatch):
    class Disabled:
        async def get_candidate_subgraph(self, *_args, **_kwargs): return None
        async def graph_evidence_for_skill(self, *_args, **_kwargs): return None
    monkeypatch.setattr('backend.routers.graph.get_graph_client', lambda: Disabled())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        assert (await client.get('/api/v1/candidates/CAND-001/graph')).status_code == 503
        assert (await client.post('/candidates/CAND-001/graph-evidence', json={'skill': 'Python'})).status_code == 503
        assert (await client.post('/candidates/CAND-001/graph-evidence', json={'skill': ' '})).status_code == 422
        assert (await client.get('/candidates/missing/graph')).status_code == 404


@pytest.mark.asyncio
async def test_graph_seeding_is_fail_soft(api_service, monkeypatch):
    service, _ = api_service
    context = await service.build_context(service.repository.get_candidate('CAND-001'))
    class Broken:
        enabled = True
        async def query(self, *_args, **_kwargs): raise RuntimeError('broken graph')
    monkeypatch.setattr('backend.services.graph.seeder.get_graph_client', lambda: Broken())
    assert await seed_candidate_graph('CAND-001', context) is False
    assert service.registry.get('CAND-001').status == 'ready'


@pytest.mark.asyncio
async def test_graph_endpoints_return_successful_payloads(api_service, monkeypatch):
    class Available:
        async def get_candidate_subgraph(self, *_args, **_kwargs):
            return CandidateSubgraph(nodes=[{'id': 'CAND-001', 'label': 'Candidate', 'properties': {'name': 'Alex'}}])
        async def graph_evidence_for_skill(self, *_args, **_kwargs):
            return [{'id': 'repo-1', 'label': 'Repository', 'properties': {'title': 'Repo'}}]
    monkeypatch.setattr('backend.routers.graph.get_graph_client', lambda: Available())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        graph = await client.get('/api/v1/candidates/CAND-001/graph')
        evidence = await client.post('/candidates/CAND-001/graph-evidence', json={'skill': 'Python'})
        assert graph.status_code == 200 and graph.json()['nodes'][0]['label'] == 'Candidate'
        assert evidence.status_code == 200 and evidence.json()[0]['label'] == 'Repository'
