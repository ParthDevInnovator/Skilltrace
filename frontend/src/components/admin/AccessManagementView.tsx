import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, ApiError, type MembershipRequest, type MembershipStatus, type WorkspaceRole, type WorkspaceSettings } from '@/services/api'

const ROLES: { value: WorkspaceRole; label: string }[] = [
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'hiring_manager', label: 'Hiring manager' },
  { value: 'hr_admin', label: 'HR admin' },
]

function reason(error: unknown, fallback: string) {
  return error instanceof ApiError && error.detail ? error.detail : fallback
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** HR-admin page for workspace admission (OI-05): membership requests and allowed sign-up domains. */
export function AccessManagementView() {
  return (
    <section className="page-stack" aria-labelledby="access-title">
      <div className="page-heading">
        <h1 id="access-title">Team access</h1>
      </div>
      <p>People who sign up from an allowed domain join this workspace as recruiters automatically. Everyone else waits here for approval.</p>
      <MembershipRequests />
      <AllowedDomains />
    </section>
  )
}

function MembershipRequests() {
  const [status, setStatus] = useState<MembershipStatus>('pending')
  const [rows, setRows] = useState<MembershipRequest[] | null>(null)
  const [error, setError] = useState('')
  const [roles, setRoles] = useState<Record<string, WorkspaceRole>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(async (filter: MembershipStatus) => {
    try {
      // Keeps any error already shown: this reload follows a failed decision.
      setRows(await api.getMembershipRequests(filter))
    } catch (err) {
      setError(reason(err, 'Could not load membership requests.'))
    }
  }, [])

  useEffect(() => {
    let live = true
    api.getMembershipRequests(status)
      .then(data => { if (live) { setRows(data); setError('') } })
      .catch(err => { if (live) setError(reason(err, 'Could not load membership requests.')) })
    return () => { live = false }
  }, [status])

  async function decide(request: MembershipRequest, decision: 'approve' | 'reject') {
    setBusy(request.id)
    setError('')
    setNotice('')
    try {
      if (decision === 'approve') {
        const role = roles[request.id] ?? 'recruiter'
        await api.approveMembershipRequest(request.id, role)
        setNotice(`${request.full_name || request.email} was approved as ${ROLES.find(r => r.value === role)?.label.toLowerCase()}.`)
      } else {
        await api.rejectMembershipRequest(request.id)
        setNotice(`${request.full_name || request.email} was rejected.`)
      }
      setRows(current => current?.filter(row => row.id !== request.id) ?? null)
    } catch (err) {
      setError(reason(err, `Could not ${decision} this request. Please retry.`))
      // Another admin may already have decided it; show the current state.
      if (err instanceof ApiError && (err.status === 404 || err.status === 409)) void load(status)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="panel" aria-labelledby="requests-title">
      <div className="page-heading">
        <h2 id="requests-title">Membership requests</h2>
        <label className="access-filter">
          <span className="sr-only">Request status</span>
          <select value={status} onChange={event => { setRows(null); setError(''); setNotice(''); setStatus(event.target.value as MembershipStatus) }}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
      </div>
      <p role="status" aria-live="polite">{notice}</p>
      {error && <p role="alert" className="access-error">{error}</p>}
      {rows === null && !error && <p aria-busy="true">Loading requests…</p>}
      {rows?.length === 0 && <p>No {status} requests.</p>}
      {!!rows?.length && (
        <div className="access-table-wrap">
          <table className="access-table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Email verified</th>
                <th scope="col">Sign-in</th>
                <th scope="col">{status === 'pending' ? 'Requested' : 'Decided'}</th>
                {status === 'pending' && <th scope="col">Decision</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td><strong>{row.full_name || '—'}</strong><br /><small>{row.email}</small></td>
                  <td>{row.email_verified ? 'Yes' : 'No'}</td>
                  <td>{row.auth_provider || 'native'}</td>
                  <td>{formatDate(status === 'pending' ? row.requested_at : row.decided_at)}</td>
                  {status === 'pending' && (
                    <td>
                      <div className="access-actions">
                        <label>
                          <span className="sr-only">Role for {row.email}</span>
                          <select
                            value={roles[row.id] ?? 'recruiter'}
                            onChange={event => setRoles(current => ({ ...current, [row.id]: event.target.value as WorkspaceRole }))}
                            disabled={busy === row.id}
                          >
                            {ROLES.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
                          </select>
                        </label>
                        <button type="button" className="primary-button" disabled={busy === row.id} onClick={() => decide(row, 'approve')} aria-label={`Approve ${row.email}`}>Approve</button>
                        <button type="button" className="secondary-button" disabled={busy === row.id} onClick={() => decide(row, 'reject')} aria-label={`Reject ${row.email}`}>Reject</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AllowedDomains() {
  const [workspace, setWorkspace] = useState<WorkspaceSettings | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let live = true
    api.getWorkspaceSettings()
      .then(data => { if (live) { setWorkspace(data); setDraft(data.allowed_domains.join(', ')) } })
      .catch(err => { if (live) setError(reason(err, 'Could not load workspace settings.')) })
    return () => { live = false }
  }, [])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!workspace) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const domains = draft.split(/[\s,]+/).map(domain => domain.trim()).filter(Boolean)
      const updated = await api.updateWorkspaceDomains(workspace.id, domains)
      setWorkspace(updated)
      setDraft(updated.allowed_domains.join(', '))
      setNotice('Allowed domains saved.')
    } catch (err) {
      setError(reason(err, 'Could not save the allowed domains.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel" aria-labelledby="domains-title">
      <h2 id="domains-title">Allowed sign-up domains{workspace ? ` for ${workspace.name}` : ''}</h2>
      <p>Verified emails from these domains are admitted without approval. Leave empty to approve everyone by hand.</p>
      {error && <p role="alert" className="access-error">{error}</p>}
      {workspace && (
        <form className="domains-form" onSubmit={save}>
          <label>
            Domains (comma separated)
            <input value={draft} onChange={event => setDraft(event.target.value)} placeholder="example.com, example.org" disabled={saving} />
          </label>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save domains'}</button>
        </form>
      )}
      {!workspace && !error && <p aria-busy="true">Loading workspace…</p>}
      <p role="status" aria-live="polite">{notice}</p>
    </div>
  )
}
