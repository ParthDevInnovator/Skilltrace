import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '@/context/AuthContext'
import { api, ApiError, type AccountProfile } from '@/services/api'

const PROVIDERS: Record<string, string> = { native: 'Email and password', google: 'Google', github: 'GitHub', clerk: 'Organization sign-in (Clerk)' }

/**
 * The signed-in user's account (OI-33). Roles and retention are administered outside this page:
 * roles by HR admins on Team access, retention by the deployment's configuration.
 */
export function AccountView() {
  const { reloadIdentity, logout } = useAuth()
  const [profile, setProfile] = useState<AccountProfile | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    api.getAccount()
      .then(data => { if (live) { setProfile(data); setName(data.full_name); setLoadError(false) } })
      .catch(() => { if (live) setLoadError(true) })
    return () => { live = false }
  }, [attempt])

  const managedElsewhere = profile?.auth_provider === 'clerk'
  async function save(event: FormEvent) {
    event.preventDefault()
    const value = name.trim().replace(/\s+/g, ' ')
    if (!value) { setMessage({ kind: 'error', text: 'Enter your full name.' }); return }
    if (value === profile?.full_name) { setMessage({ kind: 'ok', text: 'No changes to save.' }); return }
    setBusy(true); setMessage(null)
    try {
      const updated = await api.updateAccount(value)
      setProfile(updated); setName(updated.full_name)
      setMessage({ kind: 'ok', text: 'Your name was updated.' })
      void reloadIdentity()
    } catch (error) { setMessage({ kind: 'error', text: error instanceof ApiError && error.detail ? error.detail : 'Could not update your name. Please retry.' }) }
    finally { setBusy(false) }
  }

  return <section className="page-stack" aria-labelledby="account-title">
    <div className="page-heading"><h1 id="account-title">Account</h1></div>
    {loadError ? <p role="alert">Could not load your account. <button onClick={() => setAttempt(value => value + 1)}>Retry</button></p>
      : !profile ? <p role="status">Loading account…</p>
      : <>
        <form className="panel account-form" onSubmit={event => void save(event)}>
          <h2>Profile</h2>
          <label htmlFor="account-name">Full name</label>
          <input id="account-name" value={name} maxLength={255} disabled={managedElsewhere || busy} onChange={event => setName(event.target.value)} />
          {managedElsewhere && <small>Your name is managed by your organization's sign-in provider.</small>}
          <dl className="account-details">
            <dt>Email</dt><dd>{profile.email}{profile.email_verified ? ' (verified)' : ' (not verified)'}</dd>
            <dt>Sign-in method</dt><dd>{PROVIDERS[profile.auth_provider ?? ''] ?? profile.auth_provider ?? 'Unknown'}</dd>
            <dt>Workspace</dt><dd>{profile.workspace?.name ?? 'None'}</dd>
            <dt>Role</dt><dd>{profile.roles.map(role => role.replaceAll('_', ' ')).join(', ') || 'No role assigned'}</dd>
          </dl>
          {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'notice error' : 'notice'}>{message.text}</p>}
          {!managedElsewhere && <button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>}
        </form>
        <section className="panel"><h2>Access and data</h2>
          <p>Your role is assigned by an HR administrator of your workspace. Evidence retention is set by your organization's deployment and applies to everyone in the workspace.</p>
          <button onClick={() => void logout()}>Sign out</button>
        </section>
      </>}
  </section>
}
