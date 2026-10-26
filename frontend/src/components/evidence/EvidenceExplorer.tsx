import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import type { CandidateSummary } from '@/types'
import { EVIDENCE_LABELS, provenanceSummary, type CandidateContext } from '@/types/context'
import { useJob } from '@/context/JobContext'
import { EvidenceBar } from './EvidenceBar'

type Row = { candidate: CandidateSummary; context: CandidateContext | null; status: 'building' | 'ready' | 'error' }
export function EvidenceExplorer() {
  const { openCandidateDetail } = useJob()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [tier, setTier] = useState('')
  const [source, setSource] = useState('')
  const [min, setMin] = useState('')
  const retry = () => { setError(false); setWaiting(false); setRows(null); setAttempt(value => value + 1) }
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const candidates = await api.getCandidates()
        let calls = 0
        const poll = async () => {
          const next: Row[] = await Promise.all(candidates.map(async candidate => {
            try {
              const context = await api.getCandidateContext(candidate.id)
              return 'status' in context ? { candidate, context: null, status: 'building' as const } : { candidate, context, status: 'ready' as const }
            } catch { return { candidate, context: null, status: 'error' as const } }
          }))
          if (cancelled) return
          setRows(next); calls++
          if (next.some(row => row.status === 'building')) {
            if (calls < 10) timer = setTimeout(() => { void poll() }, 3000)
            else setWaiting(true)
          }
        }
        if (!cancelled) await poll()
      } catch { if (!cancelled) setError(true) }
    }
    void load()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [attempt])
  const filtered = rows?.filter(row => (!tier || row.context?.evidence_label === tier) && (!source || row.context?.evidence_records.some(record => record.source_type === source)) && (row.context?.evidence_score ?? 0) >= Math.max(0, Number(min) || 0)) ?? []
  return <section className="page-stack"><div className="page-title"><div><h1>Evidence Explorer</h1><p>Inspect observations and provenance. Evidence is separate from role fit and claim verification.</p></div><button className="secondary-button" onClick={retry}>Refresh evidence</button></div>
    <div className="evidence-filters panel"><div><label htmlFor="evidence-tier">Evidence tier</label><select id="evidence-tier" value={tier} onChange={event => setTier(event.target.value)}><option value="">All tiers</option>{EVIDENCE_LABELS.map(label => <option key={label}>{label}</option>)}</select></div><div><label htmlFor="evidence-source">Source type</label><select id="evidence-source" value={source} onChange={event => setSource(event.target.value)}><option value="">All sources</option>{['github', 'leetcode', 'linkedin', 'interview_feedback', 'project_submission'].map(value => <option key={value}>{value}</option>)}</select></div><div><label htmlFor="minimum-score">Minimum evidence score</label><input id="minimum-score" type="number" min="0" step="0.1" value={min} onChange={event => setMin(event.target.value)} /></div><button onClick={() => { setTier(''); setSource(''); setMin('') }}>Clear evidence filters</button></div>
    {error ? <div role="alert" className="notice error">Evidence Explorer could not load. <button onClick={retry}>Retry explorer</button></div> : !rows ? <p role="status">Loading evidence contexts...</p> : <>
      {(waiting || rows.some(row => row.status === 'error')) && <p role="status">Some contexts are unavailable or still building. <button onClick={retry}>Retry contexts</button></p>}
      <p role="status">Showing {filtered.length} candidates</p>
      {!filtered.length && <p className="panel">No candidates match the evidence filters.</p>}
      {filtered.map(({ candidate, context, status }) => <article key={candidate.id} className="panel explorer-row"><div><h2>{candidate.full_name}</h2><p>{candidate.headline}</p></div>{context ? <><EvidenceBar score={context.evidence_score} label={context.evidence_label} /><p className="provenance-label">{provenanceSummary(context.evidence_records)}</p><p>{Object.entries(context.evidence_records.reduce<Record<string, number>>((counts, record) => { counts[record.source_type] = (counts[record.source_type] ?? 0) + 1; return counts }, {})).map(([key, count]) => `${key}: ${count}`).join(' - ') || 'No source records'}</p></> : <p>{status === 'error' ? 'Evidence unavailable' : 'Context building - Unassessed'}</p>}<button className="secondary-button" onClick={() => openCandidateDetail(candidate.id)}>Inspect {candidate.full_name}</button></article>)}
    </>}
  </section>
}
