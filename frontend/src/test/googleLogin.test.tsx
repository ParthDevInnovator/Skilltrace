import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { GoogleLoginPage } from '@/pages/GoogleLogin'

const clerk = vi.hoisted(() => ({ sso: vi.fn() }))
vi.mock('@clerk/react', () => ({
  useSignIn: () => ({ signIn: { sso: clerk.sso }, fetchStatus: 'idle' }),
  HandleSSOCallback: () => null,
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ ready: true, isAuthenticated: false }) }))

beforeEach(() => {
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'configured-clerk-key')
  clerk.sso.mockResolvedValue({ error: null })
})
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

it('shows only Google sign-in in the split-screen layout', () => {
  render(<MemoryRouter><GoogleLoginPage /></MemoryRouter>)
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Microsoft/ })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Go beyond the resume.' })).toBeVisible()
  expect(screen.getByRole('heading', { name: /Discover what resumes/ })).toBeVisible()
})

it('starts Google OAuth with a safe dashboard destination and callback', async () => {
  const user = userEvent.setup()
  render(<MemoryRouter initialEntries={['/login?next=https://untrusted.example']}><GoogleLoginPage /></MemoryRouter>)
  await user.click(screen.getByRole('button', { name: 'Continue with Google' }))
  expect(clerk.sso).toHaveBeenCalledWith({
    strategy: 'oauth_google', redirectUrl: `${location.origin}/dashboard`,
    redirectCallbackUrl: `${location.origin}/sso-callback?next=%2Fdashboard`,
  })
  expect(screen.getByRole('button', { name: 'Connecting to Google…' })).toBeDisabled()
})

it('reports an OAuth start failure and allows another attempt', async () => {
  clerk.sso.mockRejectedValue(new Error('Network failure'))
  const user = userEvent.setup()
  render(<MemoryRouter><GoogleLoginPage /></MemoryRouter>)
  await user.click(screen.getByRole('button', { name: 'Continue with Google' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Google sign-in could not start')
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled()
})
