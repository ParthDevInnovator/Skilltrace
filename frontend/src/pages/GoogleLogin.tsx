import { HandleSSOCallback, useSignIn } from '@clerk/react'
import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

function destination(requested: string | null) {
  return requested && /^\/(dashboard|candidates)(\/|\?|$)/.test(requested) && !requested.includes('\\') ? requested : '/dashboard'
}

function GoogleIcon() {
  return <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
}

function GoogleSignIn({ next }: { next: string }) {
  const { signIn, fetchStatus } = useSignIn()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function connect() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const result = await signIn.sso({ strategy: 'oauth_google',
        redirectUrl: new URL(next, window.location.origin).href,
        redirectCallbackUrl: `${window.location.origin}/sso-callback?next=${encodeURIComponent(next)}`,
      })
      if (result.error) { setError(result.error.message || 'Google sign-in could not start. Please try again.'); setBusy(false) }
    } catch { setError('Google sign-in could not start. Please try again.'); setBusy(false) }
  }
  return <div className="google-signin"><button className="google-signin-button" disabled={busy || fetchStatus === 'fetching'} onClick={() => void connect()}><GoogleIcon /><span>{busy ? 'Connecting to Google…' : 'Continue with Google'}</span></button><p className="login-error" role={error ? 'alert' : undefined} aria-live="assertive">{error}</p><div id="clerk-captcha" /></div>
}

// Local automated acceptance uses real native API authentication, never a mock session.
function NativeTestSignIn() {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <form className="page-stack" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError('')
    try { await auth.login(email, password) }
    catch { setError('Invalid credentials. Please verify your work email and try again.') }
    finally { setBusy(false) }
  }}><label htmlFor="test-login-email">Email<input id="test-login-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label><label htmlFor="test-login-password">Password<input id="test-login-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label><p aria-live="assertive" role={error ? 'alert' : undefined}>{error}</p><button disabled={busy} className="primary-button">Sign in</button></form>
}

export function GoogleLoginPage() {
  const auth = useAuth()
  const [params] = useSearchParams()
  const next = destination(params.get('next'))
  const configured = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)
  const nativeTest = import.meta.env.MODE === 'test' || (import.meta.env.DEV && import.meta.env.VITE_E2E_NATIVE_AUTH === 'true')
  if (auth.ready && auth.isAuthenticated) return <Navigate replace to={next} />
  return (
    <main className="signin-layout">
      <h1 className="sr-only">Sign in to Skitrace</h1>
      <section className="signin-left" aria-label="Sign in">
        <div className="signin-content">
          <div className="signin-brand"><span className="signin-brand-mark">S</span><span>skitrace</span></div>
          <h2>Go beyond the resume.</h2>
          <p className="signin-subtitle">Discover the proof behind every candidate.</p>
          <div className="signin-form-area">
            <p className="signin-provider-note">Sign in securely with your Google account.</p>
            {auth.error ? <><p role="alert" className="login-error">{auth.error}</p><button className="google-signin-button" onClick={() => void auth.logout()}>Sign out and retry</button></>
              : configured ? <GoogleSignIn next={next} />
              : nativeTest ? <NativeTestSignIn />
              : <><button className="google-signin-button" disabled><GoogleIcon />Continue with Google</button><p className="login-error" role="alert">Google sign-in is not configured. Contact your administrator.</p></>}
            {params.get('error') && <p className="login-error" role="alert">Your account requires additional verification. Please contact your administrator before trying again.</p>}
          </div>
          <p className="signin-footer">Your candidate workspace is protected. Only authenticated team members can access it.</p>
        </div>
      </section>
      <section className="signin-right" aria-labelledby="signin-story">
        <div className="signin-story-content">
          <span className="signin-eyebrow"><span aria-hidden="true">●</span> Candidate intelligence platform</span>
          <h2 id="signin-story">Discover what resumes<br />cannot show.</h2>
          <div className="signin-preview-grid">
            <div className="signin-sources" aria-label="Candidate context sources">
              {[['code','GitHub','Code and repositories'],['badge','LinkedIn','Professional context'],['terminal','LeetCode','Coding activity'],['folder_open','Projects','Work and contributions']].map(([icon,title,caption]) => <div className="signin-source" key={title}><span aria-hidden="true" className="material-symbols-outlined">{icon}</span><div><strong>{title}</strong><small>{caption}</small></div></div>)}
            </div>
            <article className="signin-preview-card">
              <div className="signin-preview-heading"><div className="signin-preview-avatar" aria-hidden="true"><span className="material-symbols-outlined">person</span></div><div><h3>Candidate intelligence</h3><p>Skills traced to their source</p></div><span className="signin-fit-label">ROLE<br />CONTEXT</span></div>
              <div className="signin-skill-chips">{['Python','FastAPI','PostgreSQL','Redis'].map(skill => <span key={skill}>{skill}</span>)}</div>
              <div className="signin-preview-row"><span>Resume claims</span><span>Reported</span></div>
              <div className="signin-preview-row"><span>Evidence observations</span><span>Attributed</span></div>
              <div className="signin-preview-row"><span>Information gaps</span><span>Visible</span></div>
              <p className="signin-preview-caption"><span className="material-symbols-outlined" aria-hidden="true">fact_check</span> Know what to validate next</p>
              <small className="signin-example-label">Illustrative workspace preview</small>
            </article>
          </div>
        </div>
      </section>
    </main>
  )
}

export function GoogleSSOCallback() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = destination(params.get('next'))
  if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) return <Navigate replace to="/login" />
  return <main className="login-page"><p role="status">Completing Google sign-in…</p><HandleSSOCallback navigateToApp={({ decorateUrl }) => { window.location.assign(decorateUrl(next)) }} navigateToSignIn={() => navigate(`/login?next=${encodeURIComponent(next)}&error=verification`, { replace: true })} navigateToSignUp={() => navigate(`/login?next=${encodeURIComponent(next)}&error=verification`, { replace: true })} /></main>
}
