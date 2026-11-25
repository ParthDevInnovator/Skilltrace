/* oxlint-disable react/only-export-components, react/set-state-in-effect -- exported palette is shared by tests; candidate changes intentionally reset async view state. */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { CandidateSubgraph, GraphEdge, GraphNode, GraphNodeLabel } from '@/types'
import { api } from '@/services/api'
import { useJob } from '@/context/JobContext'

export const nodeColors: Record<GraphNodeLabel, string> = {
  Candidate: '#141618',
  Skill: '#c5a263',
  Source: '#6f7f8f',
  Project: '#d8d4ca',
  Job: '#a4823e',
  Requirement: '#4d545d',
}

const unavailable =
  'Knowledge graph is not available in this environment. Enable Neo4j to use graph exploration.'

type ViewMode = 'all' | 'skills' | 'projects' | 'sources' | 'role'

const viewLabels: Record<ViewMode, string> = {
  all: 'Everything', skills: 'Skills', projects: 'Projects', sources: 'Sources', role: 'Role fit',
}

const coverageLabels: Record<string, string> = {
  matched: 'Matched', partially_supported: 'Partially supported',
  insufficient_evidence: 'Insufficient evidence', not_assessed: 'Not assessed',
}

/** Skill evidence is keyed by candidate + skill so a late response for another key is ignored (OI-23). */
type Evidence =
  | { status: 'loading' }
  | { status: 'ready'; nodes: GraphNode[] }
  | { status: 'unavailable' }
  | { status: 'error' }

type Selection = { kind: 'skill'; key: string; skill: string; node: GraphNode } | { kind: 'node'; node: GraphNode }

const interactive: GraphNodeLabel[] = ['Candidate', 'Skill', 'Source', 'Project', 'Requirement']

const name = (node: GraphNode) => String(node.properties.name || node.properties.title || node.id)
const observationsOf = (node: GraphNode) => Array.isArray(node.properties.observations) ? node.properties.observations.map(String) : []

function layout(nodes: GraphNode[]) {
  const center = nodes.find(node => node.label === 'Candidate')
  const inner: GraphNodeLabel[] = ['Skill', 'Source', 'Job']
  const rings = [nodes.filter(node => node !== center && inner.includes(node.label)), nodes.filter(node => node !== center && !inner.includes(node.label))]
  const positioned = rings.flatMap((ring, ringIndex) => ring.map((node, index) => {
    const angle = -Math.PI * .8 + index * Math.PI * 2 / Math.max(1, ring.length)
    return { ...node, x: 450 + (ringIndex ? 335 : 220) * Math.cos(angle), y: 230 + (ringIndex ? 180 : 135) * Math.sin(angle) }
  }))
  return center ? [{ ...center, x: 450, y: 230 }, ...positioned] : positioned
}

/** Node subsets for each view; each mode shows a different question, not a relabelled copy. */
function visible(graph: CandidateSubgraph, mode: ViewMode): GraphNode[] {
  const has = (label: GraphNodeLabel) => (node: GraphNode) => node.label === label
  const candidate = graph.nodes.filter(has('Candidate'))
  const ofLabels = (...labels: GraphNodeLabel[]) => graph.nodes.filter(node => labels.includes(node.label))
  if (mode === 'skills') return ofLabels('Candidate', 'Skill')
  if (mode === 'sources') return ofLabels('Candidate', 'Source', 'Project')
  if (mode === 'projects') {
    const projectIds = new Set(graph.nodes.filter(has('Project')).map(node => node.id))
    const skillIds = new Set(graph.edges.filter(edge => edge.relationship === 'INDICATES' && projectIds.has(edge.source_id)).map(edge => edge.target_id))
    return [...candidate, ...ofLabels('Source', 'Project'), ...graph.nodes.filter(node => node.label === 'Skill' && skillIds.has(node.id))]
  }
  if (mode === 'role') {
    const requirementIds = new Set(graph.nodes.filter(has('Requirement')).map(node => node.id))
    const skillIds = new Set(graph.edges.filter(edge => edge.relationship === 'SUPPORTS' && requirementIds.has(edge.target_id)).map(edge => edge.source_id))
    return [...candidate, ...ofLabels('Job', 'Requirement'), ...graph.nodes.filter(node => node.label === 'Skill' && skillIds.has(node.id))]
  }
  return graph.nodes
}

function subtitle(node: GraphNode, edges: GraphEdge[]) {
  switch (node.label) {
    case 'Skill': {
      const claimed = edges.some(edge => edge.target_id === node.id && edge.relationship === 'CLAIMS')
      const observed = edges.some(edge => edge.target_id === node.id && edge.relationship === 'INDICATES')
      return claimed && observed ? 'Claimed · observed' : claimed ? 'Resume claim only' : 'Observed, not claimed'
    }
    case 'Source': return node.properties.synthetic ? 'Source · synthetic data' : 'Signal source'
    case 'Project': return `Listed on ${String(node.properties.source || 'source') === 'github' ? 'GitHub' : String(node.properties.source)}`
    case 'Requirement': return coverageLabels[String(node.properties.coverage_state)] || 'Requirement'
    case 'Job': return 'Selected role'
    default: return node.label
  }
}

export function GraphVisualization({ candidateId }: { candidateId?: string | null }) {
  const { openCandidateDetail, selectedJob, setActiveView } = useJob()
  const jobId = selectedJob?.id ?? null
  const [graph, setGraph] = useState<CandidateSubgraph>({ nodes: [], edges: [] })
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [evidence, setEvidence] = useState<Evidence>({ status: 'loading' })
  const evidenceRequest = useRef<{ key: string; controller: AbortController } | null>(null)

  function cancelEvidence() {
    evidenceRequest.current?.controller.abort()
    evidenceRequest.current = null
  }

  useEffect(() => {
    const controller = new AbortController()
    cancelEvidence()
    setGraph({ nodes: [], edges: [] })
    setSelection(null)
    setFailed(false)

    if (!candidateId) {
      setMessage('Select a candidate to explore their knowledge graph.')
      return
    }

    setMessage('Loading knowledge graph…')
    api
      .getCandidateGraph(candidateId, jobId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        if ('status' in result) {
          setMessage(unavailable)
        } else {
          setGraph(result)
          setMessage(result.nodes.length ? '' : 'No graph observations are available for this candidate.')
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setFailed(true)
        setMessage('Could not load graph.')
      })

    return () => {
      controller.abort()
      cancelEvidence()
    }
  }, [candidateId, jobId, attempt])

  const scope = graph.job_scope
  const roleIncluded = scope?.status === 'included'
  const modes: ViewMode[] = roleIncluded ? ['all', 'skills', 'projects', 'sources', 'role'] : ['all', 'skills', 'projects', 'sources']
  const mode = modes.includes(viewMode) ? viewMode : 'all'
  const displayedNodes = useMemo(() => layout(visible(graph, mode)), [graph, mode])

  function loadSkillEvidence(node: GraphNode) {
    if (!candidateId) return
    const skill = name(node)
    const key = `${candidateId}\u0000${skill}`
    cancelEvidence()
    const controller = new AbortController()
    evidenceRequest.current = { key, controller }
    setSelection({ kind: 'skill', key, skill, node })
    setEvidence({ status: 'loading' })
    const current = () => evidenceRequest.current?.key === key && !controller.signal.aborted
    api.getGraphEvidence(candidateId, skill, controller.signal)
      .then(result => {
        if (!current()) return
        setEvidence('status' in result ? { status: 'unavailable' } : { status: 'ready', nodes: result })
      })
      .catch(() => { if (current()) setEvidence({ status: 'error' }) })
  }

  function select(node: GraphNode) {
    if (node.label === 'Candidate') openCandidateDetail(node.id)
    else if (node.label === 'Skill') loadSkillEvidence(node)
    else if (node.label !== 'Job') { cancelEvidence(); setSelection({ kind: 'node', node }) }
  }

  function closePanel() {
    cancelEvidence()
    setSelection(null)
  }

  const ids = new Set(displayedNodes.map(node => node.id))
  const visibleEdges = graph.edges.filter(edge => ids.has(edge.source_id) && ids.has(edge.target_id))
  const byId = new Map(displayedNodes.map(node => [node.id, node]))
  const graphNodeName = (id: string) => { const node = graph.nodes.find(item => item.id === id); return node ? name(node) : id }
  const heading = roleIncluded
    ? `How this candidate's claims, sources and projects relate to ${scope.title}.`
    : 'How this candidate\'s resume claims, signal sources and public projects connect.'
  const scopeNote = scope && !roleIncluded
    ? `${scope.title} requirements will appear here ${scope.status === 'context_failed' ? 'once the candidate analysis is retried and succeeds' : 'when the candidate analysis finishes'}.`
    : null

  return <section className="graph-workspace">
    <div className="graph-heading"><div><h1>Knowledge Graph</h1><p>{heading}</p></div><nav className="graph-view-controls" aria-label="Graph views">{modes.map(item => <button key={item} aria-pressed={mode === item} onClick={() => setViewMode(item)}>{viewLabels[item]}</button>)}</nav></div>
    {scopeNote && <p className="graph-attribution" role="status">{scopeNote}</p>}
    <div className="graph-canvas-frame">
      {message && <div className="graph-message"><p role={failed ? 'alert' : 'status'}>{message}</p>{failed && <button className="secondary-button" onClick={() => setAttempt(value => value + 1)}>Retry graph</button>}{!candidateId && <button className="primary-button" onClick={() => setActiveView('talent-pool')}>Browse Talent Pool</button>}</div>}
      {!!displayedNodes.length && <svg viewBox="0 0 900 460" className="knowledge-graph intelligence-graph" aria-label="Candidate knowledge graph">
        {visibleEdges.map(edge => {
          const source = byId.get(edge.source_id)!
          const target = byId.get(edge.target_id)!
          const direct = source.label === 'Candidate' || target.label === 'Candidate'
          return <line key={`${edge.source_id}|${edge.relationship}|${edge.target_id}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={direct ? '#c4a15e' : '#dedcd5'} strokeWidth="1.5"><title>{edge.relationship.replaceAll('_', ' ').toLowerCase()}</title></line>
        })}
        {displayedNodes.map(node => {
          const isCandidate = node.label === 'Candidate'
          const title = name(node)
          const count = graph.edges.filter(edge => edge.source_id === node.id || edge.target_id === node.id).length
          const detail = isCandidate ? `${count} linked relationships` : subtitle(node, graph.edges)
          const active = interactive.includes(node.label)
          const handlers = active ? {
            role: 'button', tabIndex: 0, 'aria-label': `${node.label}: ${title}`,
            onClick: () => select(node),
            onKeyDown: (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(node) } },
          } : { role: 'img', 'aria-label': `${node.label}: ${title}` }
          return <g key={node.id} className={`intelligence-graph-node ${isCandidate ? 'graph-candidate-node' : ''} ${active ? '' : 'graph-static-node'}`} {...handlers}>
            <title>{title} · {detail}</title>
            <circle cx={node.x} cy={node.y} r="1" fill={nodeColors[node.label]} />
            <rect x={node.x - (isCandidate ? 66 : 57)} y={node.y - (isCandidate ? 39 : 25)} width={isCandidate ? 132 : 114} height={isCandidate ? 78 : 50} rx="7" fill={isCandidate ? '#242422' : '#ffffff'} stroke={isCandidate || node.label === 'Skill' ? '#c4a15e' : nodeColors[node.label]} strokeWidth={isCandidate ? '1.5' : '1'}/>
            {isCandidate && <text className="graph-node-eyebrow" x={node.x} y={node.y - 17} textAnchor="middle">CANDIDATE</text>}
            <text className="graph-node-title" x={node.x} y={node.y + (isCandidate ? 3 : -2)} textAnchor="middle">{title.length > 22 ? `${title.slice(0, 21)}…` : title}</text>
            <text className="graph-node-subtitle" x={node.x} y={node.y + (isCandidate ? 20 : 13)} textAnchor="middle">{detail}</text>
          </g>
        })}
      </svg>}
      <footer className="graph-canvas-footer"><div className="graph-link-legend"><span><i/>Direct candidate link</span><span><i/>Observation or requirement link</span><span><i/>Candidate</span></div><span>{displayedNodes.length} nodes · {visibleEdges.length} relationships</span></footer>
    </div>
    <p className="graph-attribution">A listed project or profile is an observation, not proof of authorship. Relationships do not certify claims. Select a skill, project, source or requirement to see what supports it.</p>
    {selection && <aside aria-label="Graph details" className="panel graph-evidence-panel">
      <div><h2>{selection.kind === 'skill' ? `Evidence for ${selection.skill}` : name(selection.node)}</h2><button aria-label="Close details" onClick={closePanel}>×</button></div>
      {selection.kind === 'skill' ? <SkillEvidence evidence={evidence} claimed={graph.edges.some(edge => edge.target_id === selection.node.id && edge.relationship === 'CLAIMS')} onRetry={() => loadSkillEvidence(selection.node)} /> : <NodeDetails node={selection.node} edges={graph.edges} nameOf={graphNodeName} />}
    </aside>}
  </section>
}

function SkillEvidence({ evidence, claimed, onRetry }: { evidence: Evidence; claimed: boolean; onRetry: () => void }) {
  const claim = <p>{claimed ? 'Named in a resume claim.' : 'Not named in a resume claim.'}</p>
  if (evidence.status === 'loading') return <>{claim}<p role="status">Loading linked observations…</p></>
  if (evidence.status === 'unavailable') return <>{claim}<p role="status">{unavailable}</p></>
  if (evidence.status === 'error') return <>{claim}<p role="alert">Could not load evidence for this skill.</p><button className="secondary-button" onClick={onRetry}>Retry</button></>
  if (!evidence.nodes.length) return <>{claim}<p>No public source observations are linked to this skill.</p></>
  return <>{claim}{evidence.nodes.map(node => <div key={node.id} className="graph-evidence-item">
    <p><strong>{name(node)}</strong>{node.label === 'Project' && node.properties.source_name ? ` · project listed on ${String(node.properties.source_name)}` : node.label === 'Source' ? ' · source' : ''}{node.properties.url ? <> · <a href={String(node.properties.url)} target="_blank" rel="noreferrer">open</a></> : null}</p>
    {observationsOf(node).map(text => <p key={text} className="graph-observation">{text}</p>)}
  </div>)}</>
}

function NodeDetails({ node, edges, nameOf }: { node: GraphNode; edges: GraphEdge[]; nameOf: (id: string) => string }) {
  const related = (relationship: string, from: 'source' | 'target') => edges
    .filter(edge => edge.relationship === relationship && (from === 'source' ? edge.source_id === node.id : edge.target_id === node.id))
    .map(edge => nameOf(from === 'source' ? edge.target_id : edge.source_id))
  if (node.label === 'Requirement') {
    const supporting = related('SUPPORTS', 'target')
    return <>
      <p>Coverage: <strong>{coverageLabels[String(node.properties.coverage_state)] || 'Not assessed'}</strong>{node.properties.is_mandatory === false ? ' · preferred' : ' · required'}</p>
      {node.properties.observation ? <p>{String(node.properties.observation)}</p> : null}
      <p>{supporting.length ? `Supported by: ${supporting.join(', ')}` : 'No graph skill supports this requirement.'}</p>
    </>
  }
  const indicated = related('INDICATES', 'source')
  const projects = related('LISTS', 'source')
  return <>
    <p>{node.label === 'Project' ? 'Public project observed on the candidate\'s linked source. Listing does not establish authorship.' : `${String(node.properties.name || 'Source')} signal source${node.properties.synthetic ? ' (synthetic data, not a live profile)' : ''}.`}</p>
    {node.properties.url ? <p><a href={String(node.properties.url)} target="_blank" rel="noreferrer">{String(node.properties.url)}</a></p> : null}
    {!!projects.length && <p>Projects: {projects.join(', ')}</p>}
    <p>{indicated.length ? `Indicates: ${indicated.join(', ')}` : 'No skills indicated directly.'}</p>
  </>
}
