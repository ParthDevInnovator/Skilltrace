import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'

/** Shown to signed-in users who have no workspace admission yet (OI-05). They can reach no data. */
export function PendingApprovalPage() {
  const { user, reloadIdentity, logout } = useAuth()
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState('')

  async function checkAgain() {
    setChecking(true)
    setMessage('')
    try {
      await reloadIdentity()
      setMessage('Your account is still waiting for approval.')
    } catch {
      setMessage('Could not check your status. Please try again.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <main className="status-page">
      <div className="login-card pending-card">
        <h1>Waiting for approval</h1>
        <p>
          You are signed in as <strong>{user?.email}</strong>, but this account has not been admitted to a workspace yet.
        </p>
        {user?.email_verified === false ? (
          <p>Confirm your email address using the verification link we sent you. Accounts from an approved company domain are admitted as soon as the email is verified.</p>
        ) : (
          <p>An HR administrator for your organization needs to approve your access. You will not see any jobs or candidates until then.</p>
        )}
        <p role="status" aria-live="polite">{message}</p>
        <div className="pending-actions">
          <button type="button" className="primary-button" onClick={checkAgain} disabled={checking}>
            {checking ? 'Checking…' : 'Check again'}
          </button>
          <button type="button" className="secondary-button" onClick={() => void logout()}>Sign out</button>
        </div>
      </div>
    </main>
  )
}
