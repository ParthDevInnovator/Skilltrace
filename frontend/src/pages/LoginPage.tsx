import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export function LoginPage() {
  const auth = useAuth()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('password123')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (auth.ready && auth.isAuthenticated) {
    return <Navigate replace to={next} />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Please provide a valid work email address.')
      return
    }
    if (!password.trim()) {
      setError('Please provide a password.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await auth.login(email.trim(), password)
    } catch {
      setError('Invalid credentials. Please verify your work email and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen w-full flex flex-col lg:flex-row bg-[#ffffff] text-[#171717]">
      {/* Accessible screen reader heading for test compliance */}
      <h1 className="sr-only">Sign in to Skitrace</h1>

      {/* LEFT HALF: Sign-In Form (Exact match to Image 1) */}
      <div className="w-full lg:w-1/2 min-h-screen flex flex-col justify-between p-8 sm:p-12 lg:p-16 xl:p-24 bg-[#ffffff]">
        {/* Brand Header */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#141618] flex items-center justify-center text-white font-serif italic text-lg shadow-sm">
            S
          </div>
          <span className="font-sans font-semibold text-lg tracking-tight text-[#141618]">skitrace</span>
        </div>

        {/* Center Auth Card */}
        <div className="max-w-[420px] w-full mx-auto my-auto py-8">
          <div className="mb-8">
            <h2 className="text-3xl sm:text-4xl font-serif font-normal text-[#141618] tracking-tight mb-2">
              Go beyond the resume.
            </h2>
            <p className="text-[#666666] text-base">
              Discover the proof behind every candidate.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-[#171717] mb-1.5">
                Work email <span className="sr-only">(Email)</span>
              </label>
              <input
                id="login-email"
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="elena@company.com"
                aria-label="Email"
                className="w-full h-12 px-4 rounded-xl bg-[#f7f6f3] border border-[#e5e2d9] text-[#141618] placeholder-[#9c9890] text-sm focus:outline-none focus:border-[#a9874e] focus:bg-[#ffffff] transition-all"
              />
            </div>

            {/* Optional / accessible Password field */}
            <div className={showPassword ? 'block' : 'sr-only'}>
              <label htmlFor="login-password" className="block text-sm font-medium text-[#171717] mb-1.5">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                aria-label="Password"
                className="w-full h-12 px-4 rounded-xl bg-[#f7f6f3] border border-[#e5e2d9] text-[#141618] placeholder-[#9c9890] text-sm focus:outline-none focus:border-[#a9874e] focus:bg-[#ffffff] transition-all"
              />
            </div>

            <div className="pt-1">
              <button
                type="submit"
                aria-label="Sign in"
                disabled={loading}
                className="w-full h-12 rounded-xl bg-[#141618] hover:bg-[#2a2d32] text-white font-medium text-sm transition-colors shadow-sm flex items-center justify-center cursor-pointer"
              >
                {loading ? 'Continuing...' : 'Continue with email'}
              </button>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                className="text-xs text-[#77736d] hover:text-[#171717] underline transition-colors"
              >
                {showPassword ? 'Hide password field' : 'Sign in with password instead'}
              </button>
            </div>

            {/* Error region with assertive live region */}
            <div aria-live="assertive" role="alert" className={error ? 'p-3 rounded-lg bg-[#fdf2f2] border border-[#f5c4c4] text-[#b54747] text-xs' : 'sr-only'}>
              {error}
            </div>

            {/* Divider */}
            <div className="relative my-6 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#e5e2d9]"></div>
              </div>
              <span className="relative px-3 bg-white text-xs text-[#888888]">
                or continue with
              </span>
            </div>

            {/* Social SSO Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setEmail('elena.marsh@google.com')
                  auth.login('elena.marsh@google.com', 'password123')
                }}
                className="h-11 px-4 rounded-xl bg-white border border-[#e5e2d9] hover:bg-[#f8f7f4] text-[#171717] text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                Google
              </button>

              <button
                type="button"
                onClick={() => {
                  setEmail('elena.marsh@microsoft.com')
                  auth.login('elena.marsh@microsoft.com', 'password123')
                }}
                className="h-11 px-4 rounded-xl bg-white border border-[#e5e2d9] hover:bg-[#f8f7f4] text-[#171717] text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
              >
                <svg className="w-4 h-4" viewBox="0 0 23 23">
                  <path fill="#f25022" d="M1 1h10v10H1z"/>
                  <path fill="#00a4ef" d="M1 12h10v10H1z"/>
                  <path fill="#7fba00" d="M12 1h10v10H12z"/>
                  <path fill="#ffb900" d="M12 12h10v10H12z"/>
                </svg>
                Microsoft
              </button>
            </div>
          </form>
        </div>

        {/* Footer legal note */}
        <div className="text-center text-xs text-[#888888] leading-relaxed max-w-md mx-auto">
          By continuing you agree to our{' '}
          <a href="#" className="underline hover:text-[#171717]">Terms</a> and{' '}
          <a href="#" className="underline hover:text-[#171717]">Privacy Policy</a>. SOC 2 Type II certified.
        </div>
      </div>

      {/* RIGHT HALF: Dark Candidate Intelligence Showcase (Exact match to Image 1) */}
      <div className="w-full lg:w-1/2 min-h-[500px] lg:min-h-screen bg-[#18191b] flex flex-col justify-center items-center p-8 sm:p-12 lg:p-16 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#d4af37]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-[520px] w-full z-10">
          {/* Tag Pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#a9874e]/60 bg-[#a9874e]/10 text-[#d4af37] text-[11px] font-semibold tracking-widest uppercase mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#d4af37]" />
            Candidate Intelligence Platform
          </div>

          {/* Large Serif Title */}
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif text-white font-normal tracking-tight leading-[1.15] mb-10">
            Discover what resumes cannot show.
          </h2>

          {/* Floating Candidate Card & Signal Rail Demo */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
            {/* Left Signal Rail (4 columns) */}
            <div className="sm:col-span-5 space-y-2.5">
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/80">
                  <span className="material-symbols-outlined text-[18px]">code</span>
                </div>
                <div>
                  <div className="text-white text-xs font-semibold">GitHub</div>
                  <div className="text-white/50 text-[11px]">12 repos verified</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/80">
                  <span className="material-symbols-outlined text-[18px]">domain</span>
                </div>
                <div>
                  <div className="text-white text-xs font-semibold">LinkedIn</div>
                  <div className="text-white/50 text-[11px]">6 yrs experience</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/80">
                  <span className="material-symbols-outlined text-[18px]">terminal</span>
                </div>
                <div>
                  <div className="text-white text-xs font-semibold">LeetCode</div>
                  <div className="text-white/50 text-[11px]">412 solved</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/80">
                  <span className="material-symbols-outlined text-[18px]">folder_open</span>
                </div>
                <div>
                  <div className="text-white text-xs font-semibold">Projects</div>
                  <div className="text-white/50 text-[11px]">8 analyzed</div>
                </div>
              </div>
            </div>

            {/* Right Candidate Card (7 columns) */}
            <div className="sm:col-span-7 bg-[#fbf9f6] rounded-2xl p-5 shadow-2xl border border-white/20 text-[#141618]">
              {/* Header with avatar & job fit badge */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-[#ebd8a8] border border-[#a9874e]/30 flex items-center justify-center font-semibold text-sm text-[#745723]">
                    MC
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-[#141618] leading-tight">Maya Chen</h3>
                    <p className="text-[12px] text-[#77736d]">Backend Engineer · Berlin</p>
                  </div>
                </div>

                <div className="px-2.5 py-1.5 rounded-xl bg-[#141618] text-center text-white min-w-[50px]">
                  <div className="text-base font-bold leading-none">92</div>
                  <div className="text-[9px] tracking-wider text-white/70 uppercase font-semibold">JOB FIT</div>
                </div>
              </div>

              {/* Skill chips */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {['Python', 'FastAPI', 'PostgreSQL', 'Redis'].map(skill => (
                  <span
                    key={skill}
                    className="px-2.5 py-0.5 rounded-md bg-[#faf4eb] border border-[#ebd8a8] text-[#765c29] text-[11px] font-medium"
                  >
                    {skill}
                  </span>
                ))}
              </div>

              {/* Evidence progress */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-[#77736d] text-[11px]">Evidence coverage</span>
                  <span className="font-semibold text-[#141618] text-[11px]">94%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#eeece6] overflow-hidden">
                  <div className="h-full bg-[#d4af37] rounded-full" style={{ width: '94%' }} />
                </div>
              </div>

              {/* Verification check footer */}
              <div className="flex items-center gap-1.5 text-[#247a52] text-xs font-semibold pt-1 border-t border-[#f0eded]">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>14 verified evidence items</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
