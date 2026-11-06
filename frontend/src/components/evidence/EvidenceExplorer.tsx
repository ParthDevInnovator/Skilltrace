import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import type { CandidateSummary } from '@/types'
import { EVIDENCE_LABELS, provenanceSummary, type CandidateContext } from '@/types/context'
import { useJob } from '@/context/JobContext'
import { EvidenceBar } from './EvidenceBar'
import { EvidenceCard } from './EvidenceCard'
import { useAuth } from '@/context/AuthContext'

type Row = { candidate: CandidateSummary; context: CandidateContext | null; status: 'building' | 'ready' | 'error' }

export function EvidenceExplorer() {
  const { hasRole } = useAuth()
  const canRead = hasRole('recruiter')
  const { openCandidateDetail } = useJob()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [tier, setTier] = useState('')
  const [source, setSource] = useState('')
  const [min, setMin] = useState('')

  // Redesign state
  const [searchQuery, setSearchQuery] = useState('')
  const [activePlatform, setActivePlatform] = useState('')
  const [activeSkill, setActiveSkill] = useState('')

  const retry = () => {
    setError(false)
    setWaiting(false)
    setRows(null)
    setAttempt((value) => value + 1)
  }

  useEffect(() => {
    if (!canRead) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const candidates = await api.getCandidates()
        let calls = 0
        const poll = async () => {
          const next: Row[] = await Promise.all(
            candidates.map(async (candidate) => {
              try {
                const context = await api.getCandidateContext(candidate.id)
                return 'status' in context
                  ? { candidate, context: null, status: 'building' as const }
                  : { candidate, context, status: 'ready' as const }
              } catch {
                return { candidate, context: null, status: 'error' as const }
              }
            })
          )
          if (cancelled) return
          setRows(next)
          calls++
          if (next.some((row) => row.status === 'building')) {
            if (calls < 10) timer = setTimeout(() => { void poll() }, 3000)
            else setWaiting(true)
          }
        }
        if (!cancelled) await poll()
      } catch {
        if (!cancelled) setError(true)
      }
    }
    void load()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [attempt, canRead])

  const filtered =
    rows?.filter(
      (row) =>
        (!tier || row.context?.evidence_label === tier) &&
        (!source || row.context?.evidence_records.some((record) => record.source_type === source)) &&
        (row.context?.evidence_score ?? 0) >= Math.max(0, Number(min) || 0)
    ) ?? []


  const evidence = filtered.flatMap(row => (row.context?.evidence_records ?? []).map(record => ({ record, candidate: row.candidate }))).filter(({record,candidate}) =>
    (!activePlatform || record.source_type === activePlatform) && (!activeSkill || record.skill.toLowerCase().includes(activeSkill.toLowerCase())) && (!searchQuery.trim() || `${candidate.full_name} ${record.observation} ${record.skill}`.toLowerCase().includes(searchQuery.trim().toLowerCase())))
  function exportEvidence() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(evidence.map(({record,candidate}) => ({...record,candidate_name:candidate.full_name})),null,2)], {type:'application/json'}))
    const a = document.createElement('a'); a.href = url; a.download = 'skitrace-evidence.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000)
  }
  if (!canRead) return <section className="panel"><h1>Evidence Explorer</h1><p>Raw evidence context requires recruiter access. Interview questions remain available in candidate profiles.</p></section>
  return <section className="page-stack"><div className="page-heading"><h1>Evidence Explorer</h1><button onClick={exportEvidence} disabled={!rows || error}>Export evidence</button></div><p>Attributed observations do not automatically verify claims. Missing public evidence is unknown, not a contradiction.</p>
  <div className="panel evidence-filters"><div><label htmlFor="evidence-search">Search evidence</label><input id="evidence-search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div><div><label htmlFor="evidence-platform">Platform</label><select id="evidence-platform" value={activePlatform} onChange={e => setActivePlatform(e.target.value)}><option value="">All platforms</option>{['github','leetcode','linkedin','interview_feedback','project_submission'].map(p => <option key={p}>{p}</option>)}</select></div><div><label htmlFor="evidence-skill">Skill</label><input id="evidence-skill" value={activeSkill} onChange={e => setActiveSkill(e.target.value)} /></div></div>
  <div className="panel evidence-filters"><div><label htmlFor="evidence-tier">Evidence tier</label><select id="evidence-tier" value={tier} onChange={e => setTier(e.target.value)}><option value="">All tiers</option>{EVIDENCE_LABELS.map(t => <option key={t}>{t}</option>)}</select></div><div><label htmlFor="evidence-source">Source type</label><select id="evidence-source" value={source} onChange={e => setSource(e.target.value)}><option value="">All sources</option>{['github','leetcode','linkedin','interview_feedback','project_submission'].map(p => <option key={p}>{p}</option>)}</select></div><div><label htmlFor="evidence-min">Minimum evidence score</label><input id="evidence-min" type="number" min="0" step="0.1" value={min} onChange={e => setMin(e.target.value)} /></div><button onClick={() => {setTier('');setSource('');setMin('');setActivePlatform('');setActiveSkill('');setSearchQuery('')}}>Clear evidence filters</button></div>
  {error && <p role="alert">Evidence explorer could not load. <button onClick={retry}>Retry explorer</button></p>}
  {!rows && !error && <p role="status">Loading evidence…</p>}
  {waiting && <p>Some contexts are still building. <button onClick={retry}>Retry explorer</button></p>}
  {rows && <p role="status">Showing {filtered.length} candidates · {evidence.length} evidence items</p>}
  {rows && !filtered.length && <p>No candidates match the evidence filters.</p>}
  {filtered.map(row => <article className="panel" key={row.candidate.id}><h2>{row.candidate.full_name}</h2>{row.context ? <><EvidenceBar score={row.context.evidence_score} label={row.context.evidence_label} /><p>{provenanceSummary(row.context.evidence_records)}</p></> : <p>{row.status === 'error' ? 'Evidence unavailable.' : 'Context building.'}</p>}<button onClick={() => openCandidateDetail(row.candidate.id)}>Inspect {row.candidate.full_name}</button></article>)}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{evidence.map(({record,candidate}) => <article className="panel" key={`${candidate.id}-${record.id}`}><h2>{candidate.full_name}</h2><EvidenceCard record={record} /></article>)}</div>
  {rows && !evidence.length && <p>No evidence observations match the filters.</p>}</section>
}
