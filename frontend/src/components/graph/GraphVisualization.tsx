/* oxlint-disable react/only-export-components, react/set-state-in-effect -- exported palette is shared by tests; candidate changes intentionally reset async view state. */
import { useEffect, useMemo, useState } from 'react'
import type { CandidateSubgraph, GraphNode } from '@/types'
import { api } from '@/services/api'
import { useJob } from '@/context/JobContext'

export const nodeColors = {
  Candidate: '#141618',
  Skill: '#c5a263',
  Repository: '#d8d4ca',
  Job: '#a4823e',
  Requirement: '#4d545d',
}

const unavailable =
  'Knowledge graph is not available in this environment. Enable Neo4j to use graph exploration.'

function layout(graph: CandidateSubgraph) {
  const center = graph.nodes.find(node => node.label === 'Candidate')
  const rings = [graph.nodes.filter(node => node.id !== center?.id && ['Skill', 'Repository'].includes(node.label)), graph.nodes.filter(node => node.id !== center?.id && !['Skill', 'Repository'].includes(node.label))]
  const positioned = rings.flatMap((ring, ringIndex) => ring.map((node, index) => {
    const angle = -Math.PI * .8 + index * Math.PI * 2 / Math.max(1, ring.length)
    return { ...node, x: 450 + (ringIndex ? 335 : 220) * Math.cos(angle), y: 230 + (ringIndex ? 180 : 135) * Math.sin(angle) }
  }))
  return center ? [{ ...center, x: 450, y: 230 }, ...positioned] : positioned
}

export function GraphVisualization({ candidateId }: { candidateId?: string | null }) {
  const { openCandidateDetail, selectedJob, setActiveView } = useJob()
  const [graph, setGraph] = useState<CandidateSubgraph>({ nodes: [], edges: [] })
  const [message, setMessage] = useState('')
  const [related, setRelated] = useState<GraphNode[]>([])
  const [skill, setSkill] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const [viewMode, setViewMode] = useState<'all' | 'projects' | 'sources'>('all')

  const jobTitle = selectedJob?.title || 'the selected candidate'

  useEffect(() => {
    let cancelled = false
    setGraph({ nodes: [], edges: [] })
    setRelated([])
    setSkill('')
    setFailed(false)

    if (!candidateId) {
      setMessage('Select a candidate to explore their knowledge graph.')
      return
    }

    setMessage('Loading knowledge graph…')
    api
      .getCandidateGraph(candidateId)
      .then((result) => {
        if (cancelled) return
        if ('status' in result) {
          setMessage(unavailable)
        } else {
          setGraph(result)
          setMessage(result.nodes.length ? '' : 'No graph observations are available for this candidate.')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
          setMessage('Could not load graph.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [candidateId, attempt])

  const nodes = useMemo(() => layout(graph), [graph])

  async function select(node: GraphNode) {
    if (node.label === 'Candidate') openCandidateDetail(node.id)
    if (node.label === 'Skill' && candidateId) {
      setSkill(String(node.properties.name || node.id))
      setRelated([])
      try {
        const result = await api.getGraphEvidence(candidateId, String(node.properties.name || node.id))
        if ('status' in result) setMessage(unavailable)
        else setRelated(result)
      } catch {
        setMessage('Could not load skill evidence.')
      }
    }
  }

  const displayedNodes = viewMode === 'projects' ? nodes.filter(n => ['Candidate','Skill','Repository'].includes(n.label)) : viewMode === 'sources' ? nodes.filter(n => ['Candidate','Repository'].includes(n.label)) : nodes
  const visibleEdges = graph.edges.filter(edge => displayedNodes.some(node => node.id === edge.source_id) && displayedNodes.some(node => node.id === edge.target_id))
  const connectedToCandidate = (source: string, target: string) => displayedNodes.some(node => node.label === 'Candidate' && (node.id === source || node.id === target))
  return <section className="graph-workspace">
    <div className="graph-heading"><div><h1>Knowledge Graph</h1><p>How candidates, skills, projects and evidence connect for {jobTitle}.</p></div><nav className="graph-view-controls" aria-label="Graph views">{(['all', 'projects', 'sources'] as const).map(mode => <button key={mode} aria-pressed={viewMode === mode} onClick={() => setViewMode(mode)}>{mode === 'all' ? 'Candidates + Skills' : mode === 'projects' ? 'Projects' : 'Sources'}</button>)}</nav></div>
    <div className="graph-canvas-frame">
      {message && <div className="graph-message"><p role={failed ? 'alert' : 'status'}>{message}</p>{failed && <button className="secondary-button" onClick={() => setAttempt(value => value + 1)}>Retry graph</button>}{!candidateId && <button className="primary-button" onClick={() => setActiveView('talent-pool')}>Browse Talent Pool</button>}</div>}
      {!!displayedNodes.length && <svg viewBox="0 0 900 460" className="knowledge-graph intelligence-graph" aria-label="Candidate knowledge graph">
        {visibleEdges.map((edge, index) => {
          const source = displayedNodes.find(node => node.id === edge.source_id)!
          const target = displayedNodes.find(node => node.id === edge.target_id)!
          return <line key={index} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={connectedToCandidate(source.id, target.id) ? '#c4a15e' : '#dedcd5'} strokeWidth="1.5"><title>{edge.relationship.replaceAll('_', ' ')}</title></line>
        })}
        {displayedNodes.map(node => {
          const isCandidate = node.label === 'Candidate'
          const title = String(node.properties.name || node.properties.title || node.id)
          const count = graph.edges.filter(edge => edge.source_id === node.id || edge.target_id === node.id).length
          const subtitle = node.label === 'Skill' ? `${count} linked relationship${count === 1 ? '' : 's'}` : node.label === 'Repository' ? 'Project evidence' : node.label
          return <g key={node.id} className={`intelligence-graph-node ${isCandidate ? 'graph-candidate-node' : ''}`} role="button" tabIndex={0} aria-label={`${node.label}: ${title}`} onClick={() => void select(node)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void select(node) } }}>
            <title>{title} ? {subtitle}</title>
            <circle cx={node.x} cy={node.y} r="1" fill={nodeColors[node.label]} />
            <rect x={node.x - (isCandidate ? 66 : 57)} y={node.y - (isCandidate ? 39 : 25)} width={isCandidate ? 132 : 114} height={isCandidate ? 78 : 50} rx="7" fill={isCandidate ? '#242422' : '#ffffff'} stroke={isCandidate || node.label === 'Skill' ? '#c4a15e' : '#e8e4dc'} strokeWidth={isCandidate ? '1.5' : '1'}/>
            {isCandidate && <text className="graph-node-eyebrow" x={node.x} y={node.y - 17} textAnchor="middle">CANDIDATE</text>}
            <text className="graph-node-title" x={node.x} y={node.y + (isCandidate ? 3 : -2)} textAnchor="middle">{title.length > 22 ? `${title.slice(0, 21)}?` : title}</text>
            <text className="graph-node-subtitle" x={node.x} y={node.y + (isCandidate ? 20 : 13)} textAnchor="middle">{isCandidate ? `${count} linked relationships` : subtitle}</text>
          </g>
        })}
      </svg>}
      <footer className="graph-canvas-footer"><div className="graph-link-legend"><span><i/>Candidate link</span><span><i/>Associated</span><span><i/>Candidate</span></div><span>{displayedNodes.length} nodes ? {visibleEdges.length} relationships</span></footer>
    </div>
    {viewMode === 'sources' && <p className="graph-attribution">Sources shows repository evidence linked to the candidate.</p>}
    <p className="graph-attribution">Attributed relationships do not certify claims. Select a skill to inspect its linked observations.</p>
    {skill && <aside aria-label="Skill evidence" className="panel graph-evidence-panel"><div><h2>Evidence for {skill}</h2><button aria-label="Close skill evidence" onClick={() => { setSkill(''); setRelated([]) }}>?</button></div>{related.length ? related.map(node => <p key={node.id}>{String(node.properties.title || node.properties.url || node.id)}</p>) : <p>No linked observations found.</p>}</aside>}
  </section>
}
