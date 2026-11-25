import logging
from functools import lru_cache
from typing import Literal
from pydantic import BaseModel, Field
from backend.config import settings
from backend.services.taxonomy import resolve_skill

logger = logging.getLogger(__name__)


# Persisted labels (see seeder.py). Job/Requirement are never stored: they are a
# per-request overlay computed from the same match as JD Match (OI-22).
STORED_LABELS = ('Candidate', 'Skill', 'Source', 'Project')
NodeLabel = Literal['Candidate', 'Skill', 'Source', 'Project', 'Job', 'Requirement']


class GraphNode(BaseModel):
    id: str
    label: NodeLabel
    properties: dict = Field(default_factory=dict)


class GraphEdge(BaseModel):
    source_id: str
    target_id: str
    relationship: str


class JobScope(BaseModel):
    job_id: str
    title: str
    # included: Job/Requirement nodes are in the graph; context_building /
    # context_failed: the candidate has no ready context to match against yet.
    status: Literal['included', 'context_building', 'context_failed']


class CandidateSubgraph(BaseModel):
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
    job_scope: JobScope | None = None


def _stored(nodes, edges):
    """Keep only current-model nodes; nodes written by older seeders (Repository,
    persisted Job/Requirement) disappear from reads until the candidate is reseeded."""
    kept = {key: node for key, node in nodes.items() if node.label in STORED_LABELS}
    return CandidateSubgraph(nodes=list(kept.values()), edges=[edge for edge in edges.values()
        if edge.source_id in kept and edge.target_id in kept])


def _node(data):
    return GraphNode.model_validate(data) if data.get('label') in STORED_LABELS else None


class Neo4jClient:
    def __init__(self, driver=None):
        self.driver = driver
        if driver is None and settings.NEO4J_URI and settings.NEO4J_USER and settings.NEO4J_PASSWORD:
            try:
                from neo4j import AsyncGraphDatabase
                self.driver = AsyncGraphDatabase.driver(settings.NEO4J_URI,
                    auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD.get_secret_value()),
                    connection_timeout=5, max_transaction_retry_time=5)
            except Exception:
                logger.warning('Graph driver unavailable')

    @property
    def enabled(self):
        return self.driver is not None

    async def query(self, query, **parameters):
        if not self.enabled:
            return None
        try:
            async with self.driver.session() as session:
                result = await session.run(query, parameters)
                return await result.data()
        except Exception:
            logger.warning('Graph query unavailable')
            return None

    async def execute_write(self, work, *args):
        """Run ``work(tx, *args)`` in one managed write transaction; errors propagate
        so the caller can tell a rejected write from a committed one."""
        if not self.enabled:
            return None
        async with self.driver.session() as session:
            return await session.execute_write(work, *args)

    async def delete_candidate(self, candidate_id) -> bool:
        """Remove the candidate, its candidate-scoped nodes and any skills left orphaned."""
        rows = await self.query('''OPTIONAL MATCH (n) WHERE n.candidate_id = $candidate_id
            DETACH DELETE n
            WITH count(*) AS ignored
            OPTIONAL MATCH (c:Candidate {id: $candidate_id})
            DETACH DELETE c
            WITH count(*) AS ignored
            OPTIONAL MATCH (s:Skill) WHERE NOT (s)--()
            DELETE s
            RETURN true AS done''', candidate_id=candidate_id)
        return rows is not None

    async def close(self):
        if self.driver:
            await self.driver.close()

    async def get_candidate_subgraph(self, candidate_id, *, report_unavailable=False):
        rows = await self.query('''MATCH (c:Candidate {id: $candidate_id})
            OPTIONAL MATCH p=(c)-[*1..3]->(n)
            WHERE all(x IN nodes(p) WHERE x:Candidate OR x:Skill OR x.candidate_id = $candidate_id)
            RETURN c, collect(p) AS paths''', candidate_id=candidate_id)
        if rows is None:
            return None if report_unavailable else CandidateSubgraph()
        nodes, edges = {}, {}
        def add_node(node):
            label = next((v for v in STORED_LABELS if v in node.labels), None)
            if label and node.get('id'):
                nodes[node['id']] = GraphNode(id=node['id'], label=label, properties=dict(node))
        # Driver data() serializes nodes to dicts; query projections below are
        # used for portable data-only transport and simple mocked drivers.
        for row in rows:
            for node in row.get('nodes', []):
                if item := _node(node):
                    nodes[item.id] = item
            for edge in row.get('edges', []):
                item = GraphEdge.model_validate(edge)
                edges[(item.source_id, item.target_id, item.relationship)] = item
        if rows and not nodes:
            projected = await self.query('''MATCH (c:Candidate {id: $candidate_id})
                OPTIONAL MATCH p=(c)-[*1..3]->(n)
                WHERE all(x IN nodes(p) WHERE x:Candidate OR x:Skill OR x.candidate_id = $candidate_id)
                WITH c, collect(p) AS paths
                RETURN [{id:c.id, label:'Candidate', properties:properties(c)}] +
                reduce(ns=[], p IN paths | ns + [n IN nodes(p) | {id:n.id,label:labels(n)[0],properties:properties(n)}]) AS nodes,
                reduce(es=[], p IN paths | es + [r IN relationships(p) |
                {source_id:startNode(r).id,target_id:endNode(r).id,relationship:type(r)}]) AS edges''', candidate_id=candidate_id)
            if projected is None:
                return None if report_unavailable else CandidateSubgraph()
            for row in projected:
                for node in row['nodes']:
                    if item := _node(node):
                        nodes[item.id] = item
                for edge in row['edges']:
                    item = GraphEdge.model_validate(edge)
                    edges[(item.source_id, item.target_id, item.relationship)] = item
        return _stored(nodes, edges)

    async def graph_evidence_for_skill(self, candidate_id, skill, *, report_unavailable=False):
        """Projects and sources that indicate ``skill``, each with its observation text."""
        rows = await self.query('''MATCH (c:Candidate {id:$candidate_id})-[:HAS_SOURCE]->(src:Source)
                  -[:LISTS]->(n:Project)-[r:INDICATES]->(:Skill {id:$skill})
            RETURN {id:n.id, label:'Project', properties:n{.*, source_name:src.name, observations:r.observations}} AS node
            UNION
            MATCH (c:Candidate {id:$candidate_id})-[:HAS_SOURCE]->(n:Source)-[r:INDICATES]->(:Skill {id:$skill})
            RETURN {id:n.id, label:'Source', properties:n{.*, observations:r.observations}} AS node''',
            candidate_id=candidate_id, skill=resolve_skill(skill))
        if rows is None:
            return None if report_unavailable else []
        return [node for row in rows if (node := _node(row['node']))]


@lru_cache(maxsize=1)
def get_graph_client():
    return Neo4jClient()


async def get_candidate_subgraph(candidate_id):
    return await get_graph_client().get_candidate_subgraph(candidate_id)


async def graph_evidence_for_skill(candidate_id, skill):
    return await get_graph_client().graph_evidence_for_skill(candidate_id, skill)
