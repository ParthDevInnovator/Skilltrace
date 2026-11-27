import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError, type AuditLogEntry, type AuditLogQuery } from '@/services/api'
import type { CandidateSummary } from '@/types'

const ACTIONS = ['VIEW', 'EXPORT', 'DELETE', 'DELETE_FAILED', 'CLAIM_REVIEW', 'DENIED', 'LOGIN', 'LOGOUT', 'REGISTER',
  'VERIFY_EMAIL', 'LINK_IDENTITY', 'APPROVE_MEMBER', 'REJECT_MEMBER', 'UPDATE_DOMAINS', 'UPDATE_PROFILE']
const AUDIT_PAGE_SIZE = 50

const reason = (error: unknown, fallback: string) => error instanceof ApiError && error.detail ? error.detail : fallback

/** HR-admin record management (OI-33): candidate erasure and audit log review. */
export function RecordsView() {
  return <section className="page-stack" aria-labelledby="records-title">
    <div className="page-heading"><h1 id="records-title">Records &amp; audit</h1></div>
    <CandidateErasure />
    <AuditLog />
  </section>
}

function CandidateErasure() {
  const [candidates, setCandidates] = useState<CandidateSummary[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState<CandidateSummary | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    api.getCandidates()
      .then(rows => { if (live) { setCandidates(rows); setLoadError(false) } })
      .catch(() => { if (live) setLoadError(true) })
    return () => { live = false }
  }, [attempt])

  async function erase() {
    if (!confirming || typed.trim() !== confirming.full_name.trim()) return
    setBusy(true); setMessage(null)
    try {
      await api.deleteCandidate(confirming.id)
      setCandidates(rows => rows?.filter(row => row.id !== confirming.id) ?? null)
      setMessage({ kind: 'ok', text: `${confirming.full_name} and all of their data were deleted.` })
      setConfirming(null); setTyped('')
    } catch (error) { setMessage({ kind: 'error', text: reason(error, 'The candidate could not be deleted. Nothing was removed; retry.') }) }
    finally { setBusy(false) }
  }

  const q = query.trim().toLowerCase()
  const shown = (candidates ?? []).filter(row => !q || `${row.full_name} ${row.headline} ${row.id}`.toLowerCase().includes(q)).slice(0, 50)
  return <section className="panel" aria-labelledby="erasure-title">
    <h2 id="erasure-title">Delete candidate data</h2>
    <p>Deleting a candidate removes their profile, resume, evidence, job memberships, notifications and knowledge-graph data. Audit entries record the deletion. This cannot be undone.</p>
    <label htmlFor="erasure-search">Find candidate</label>
    <input id="erasure-search" value={query} placeholder="Name, headline or ID" onChange={event => setQuery(event.target.value)} />
    {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'notice error' : 'notice'}>{message.text}</p>}
    {loadError ? <p role="alert">Could not load candidates. <button onClick={() => setAttempt(value => value + 1)}>Retry</button></p>
      : !candidates ? <p role="status">Loading candidates…</p>
      : !shown.length ? <p>No candidates match.</p>
      : <ul className="records-candidates">{shown.map(row => <li key={row.id}>
          <span><strong>{row.full_name}</strong> <small>{row.headline || row.id}</small></span>
          <button disabled={busy} aria-label={`Delete ${row.full_name}`} onClick={() => { setConfirming(row); setTyped(''); setMessage(null) }}>Delete…</button>
        </li>)}</ul>}
    {confirming && <div className="records-confirm" role="group" aria-labelledby="erasure-confirm-title">
      <h3 id="erasure-confirm-title">Delete {confirming.full_name}?</h3>
      <label htmlFor="erasure-confirm">Type the candidate's full name to confirm</label>
      <input id="erasure-confirm" value={typed} autoComplete="off" onChange={event => setTyped(event.target.value)} />
      <div className="records-confirm-actions">
        <button disabled={busy} onClick={() => { setConfirming(null); setTyped('') }}>Cancel</button>
        <button className="danger-button" disabled={busy || typed.trim() !== confirming.full_name.trim()} onClick={() => void erase()}>{busy ? 'Deleting…' : 'Delete permanently'}</button>
      </div>
    </div>}
  </section>
}

function AuditLog() {
  const [filters, setFilters] = useState<AuditLogQuery>({})
  const [form, setForm] = useState({ action_type: '', candidate_id: '', date_from: '', date_to: '' })
  const [page, setPage] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; rows: AuditLogEntry[] | null; error: string }>({ key: '', rows: null, error: '' })
  const key = JSON.stringify([filters, page, attempt])
  useEffect(() => {
    let live = true
    api.getAuditLogs({ ...filters, page, page_size: AUDIT_PAGE_SIZE })
      .then(rows => { if (live) setResult({ key, rows, error: '' }) })
      .catch(err => { if (live) setResult({ key, rows: null, error: reason(err, 'Could not load the audit log.') }) })
    return () => { live = false }
  }, [filters, page, key])
  const current = result.key === key ? result : null
  const rows = current?.rows ?? null
  const error = current?.error ?? ''
  const load = () => setAttempt(value => value + 1)

  function apply(event: FormEvent) {
    event.preventDefault()
    // Date inputs are calendar days; the end day is inclusive.
    setFilters({
      action_type: form.action_type || undefined, candidate_id: form.candidate_id.trim() || undefined,
      date_from: form.date_from ? `${form.date_from}T00:00:00Z` : undefined, date_to: form.date_to ? `${form.date_to}T23:59:59Z` : undefined,
    })
    setPage(1)
  }
  return <section className="panel" aria-labelledby="audit-title">
    <h2 id="audit-title">Audit log</h2>
    <form className="audit-filters" onSubmit={apply}>
      <label>Action<select value={form.action_type} onChange={event => setForm({ ...form, action_type: event.target.value })}><option value="">All actions</option>{ACTIONS.map(action => <option key={action} value={action}>{action.replaceAll('_', ' ').toLowerCase()}</option>)}</select></label>
      <label>Candidate ID<input value={form.candidate_id} maxLength={64} onChange={event => setForm({ ...form, candidate_id: event.target.value })} /></label>
      <label>From<input type="date" value={form.date_from} onChange={event => setForm({ ...form, date_from: event.target.value })} /></label>
      <label>To<input type="date" value={form.date_to} onChange={event => setForm({ ...form, date_to: event.target.value })} /></label>
      <button>Apply filters</button>
    </form>
    {error ? <p role="alert">{error} <button onClick={load}>Retry</button></p>
      : !rows ? <p role="status">Loading audit log…</p>
      : !rows.length ? <p>No audit entries match these filters.</p>
      : <div className="results-table-scroll"><table className="audit-table"><thead><tr>{['Time', 'User', 'Action', 'Endpoint', 'Candidate', 'Status'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          <td><time dateTime={row.occurred_at}>{new Date(row.occurred_at).toLocaleString()}</time></td>
          <td>{row.user_name || row.user_email ? <>{row.user_name}<small>{row.user_email}</small></> : row.user_id ? <small>{row.user_id}</small> : 'Anonymous'}</td>
          <td>{row.action_type}</td><td><code>{row.method} {row.endpoint}</code></td><td>{row.candidate_id ?? '—'}</td><td>{row.status_code ?? '—'}</td>
        </tr>)}</tbody></table></div>}
    <div className="audit-paging"><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous page</button><span role="status">Page {page}</span><button disabled={!rows || rows.length < AUDIT_PAGE_SIZE} onClick={() => setPage(value => value + 1)}>Next page</button></div>
  </section>
}
