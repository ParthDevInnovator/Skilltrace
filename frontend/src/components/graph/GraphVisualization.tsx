import { useEffect, useMemo, useState } from 'react'
import type { CandidateSubgraph, GraphNode } from '@/types'
import { api } from '@/services/api'
import { useJob } from '@/context/JobContext'

export const nodeColors = { Candidate:'#7c3aed', Skill:'#2563eb', Repository:'#15803d', Job:'#a16207', Requirement:'#4b5563' }
const unavailable = 'Knowledge graph is not available in this environment. Enable Neo4j to use graph exploration.'
function layout(graph:CandidateSubgraph) {
  const nodes = graph.nodes.map((n,i)=>({...n,x:300+180*Math.cos(i*2*Math.PI/Math.max(1,graph.nodes.length)),y:220+150*Math.sin(i*2*Math.PI/Math.max(1,graph.nodes.length))}))
  const byId = new Map(nodes.map(n=>[n.id,n]))
  // Deterministic bounded force simulation; no editing or additional dependency.
  for(let step=0;step<100;step++) {
    const forces = nodes.map(n=>({x:(300-n.x)*0.005,y:(220-n.y)*0.005}))
    nodes.forEach((a,i)=>nodes.forEach((b,j)=>{if(i===j)return;const dx=a.x-b.x,dy=a.y-b.y,d=Math.max(25,dx*dx+dy*dy);forces[i].x+=dx*500/d;forces[i].y+=dy*500/d}))
    graph.edges.forEach(e=>{const a=byId.get(e.source_id),b=byId.get(e.target_id);if(!a||!b)return;const dx=b.x-a.x,dy=b.y-a.y,d=Math.max(1,Math.hypot(dx,dy)),f=(d-110)*0.015;const ai=nodes.indexOf(a),bi=nodes.indexOf(b);forces[ai].x+=dx/d*f;forces[ai].y+=dy/d*f;forces[bi].x-=dx/d*f;forces[bi].y-=dy/d*f})
    nodes.forEach((n,i)=>{n.x=Math.max(40,Math.min(560,n.x+forces[i].x));n.y=Math.max(40,Math.min(400,n.y+forces[i].y))})
  }
  return nodes
}
export function GraphVisualization({candidateId}:{candidateId?:string|null}) {
  const {openCandidateDetail} = useJob()
  const [graph,setGraph]=useState<CandidateSubgraph>({nodes:[],edges:[]})
  const [message,setMessage]=useState('')
  const [related,setRelated]=useState<GraphNode[]>([])
  const [skill,setSkill]=useState('')
  const [attempt,setAttempt]=useState(0)
  const [failed,setFailed]=useState(false)
  useEffect(()=>{let cancelled=false;setGraph({nodes:[],edges:[]});setRelated([]);setSkill('');setFailed(false)
    if(!candidateId){setMessage('Select a candidate to explore their knowledge graph.');return}
    setMessage('Loading knowledge graph…')
    api.getCandidateGraph(candidateId).then(result=>{if(cancelled)return;if('status'in result)setMessage(unavailable);else{setGraph(result);setMessage(result.nodes.length?'':'No graph observations are available for this candidate.')}}).catch(()=>{if(!cancelled){setFailed(true);setMessage('Could not load graph.')}})
    return()=>{cancelled=true}
  },[candidateId,attempt])
  const nodes=useMemo(()=>layout(graph),[graph])
  async function select(node:GraphNode) {
    if(node.label==='Candidate')openCandidateDetail(node.id)
    if(node.label==='Skill'&&candidateId){setSkill(String(node.properties.name||node.id));setRelated([]);try{const result=await api.getGraphEvidence(candidateId,String(node.properties.name||node.id));if('status'in result)setMessage(unavailable);else setRelated(result)}catch{setMessage('Could not load skill evidence.')}}
  }
  return <section className="panel"><h1>Knowledge Graph</h1>{message&&<p role="status">{message}</p>}{failed&&<button onClick={()=>setAttempt(v=>v+1)}>Retry graph</button>}
    {!!nodes.length&&<><div className="graph-legend">{Object.entries(nodeColors).map(([label,color])=><span key={label}><i style={{background:color}}/>{label}</span>)}</div><svg viewBox="0 0 600 440" className="knowledge-graph" aria-label="Candidate knowledge graph">{graph.edges.map((e,i)=>{const a=nodes.find(n=>n.id===e.source_id),b=nodes.find(n=>n.id===e.target_id);return a&&b?<line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#94a3b8"><title>{e.relationship}</title></line>:null})}{nodes.map(n=><g key={n.id} role="button" tabIndex={0} aria-label={`${n.label}: ${n.properties.name||n.properties.title||n.id}`} onClick={()=>select(n)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();void select(n)}}}><circle cx={n.x} cy={n.y} r={16} fill={nodeColors[n.label]}/><text x={n.x} y={n.y+30} textAnchor="middle" fontSize="11">{String(n.properties.name||n.properties.title||n.label).slice(0,26)}</text></g>)}</svg></>}
    {skill&&<aside aria-label="Skill evidence"><h2>Evidence for {skill}</h2>{related.length?related.map(n=><p key={n.id}>{String(n.properties.title||n.properties.url||n.id)}</p>):<p>No linked observations found.</p>}</aside>}
  </section>
}
