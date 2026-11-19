import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@/App'
import { AccessManagementView } from '@/components/admin/AccessManagementView'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const workspace = { id: 'acme', name: 'Acme Hiring' }
const pending = { user_id: 'u1', email: 'new@outside.com', full_name: 'New Person', roles: ['pending'], status: 'pending', email_verified: true, workspace: null }
const active = (roles: string[]) => ({ ...pending, email: 'r@acme.com', roles, status: 'active', workspace })
const path = (url: unknown) => String(url).split('?')[0]
const callsTo = (endpoint: string) => vi.mocked(fetch).mock.calls.filter(([url]) => path(url) === endpoint)

/** Signs in through the real provider; `me` answers /auth/me, everything else is an empty list. */
function signIn(me: () => unknown) {
  sessionStorage.setItem('mosaic.test_unauthenticated', 'true')
  sessionStorage.setItem('mosaic.access_token', 'access-1')
  sessionStorage.setItem('mosaic.refresh_token', 'refresh-1')
  vi.mocked(fetch).mockImplementation(async url => (path(url) === '/api/v1/auth/me' ? json(me()) : json([])))
  history.replaceState({}, '', '/dashboard')
  render(<App />)
}

beforeEach(() => { sessionStorage.clear(); vi.stubGlobal('fetch', vi.fn()) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear() })

describe('pending accounts (OI-05)', () => {
  it('shows the approval screen and never mounts the workspace or loads data', async () => {
    signIn(() => pending)
    expect(await screen.findByRole('heading', { name: 'Waiting for approval' })).toBeVisible()
    expect(screen.getByText('new@outside.com')).toBeVisible()
    expect(screen.queryByRole('navigation', { name: 'Workspace' })).not.toBeInTheDocument()
    expect(callsTo('/api/v1/jobs')).toHaveLength(0)
    expect(callsTo('/api/v1/candidates')).toHaveLength(0)
  })

  it('asks unverified accounts to confirm their email first', async () => {
    signIn(() => ({ ...pending, email_verified: false }))
    expect(await screen.findByText(/Confirm your email address/)).toBeVisible()
  })

  it('opens the workspace once an administrator has approved the account', async () => {
    let me: unknown = pending
    signIn(() => me)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Check again' }))
    expect(await screen.findByText('Your account is still waiting for approval.')).toBeVisible()
    me = active(['recruiter'])
    await user.click(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByRole('navigation', { name: 'Workspace' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Waiting for approval' })).not.toBeInTheDocument()
  })

  it('lets a pending user sign out', async () => {
    signIn(() => pending)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in to Skitrace' })).toBeVisible()
    expect(sessionStorage.getItem('mosaic.access_token')).toBeNull()
  })
})

describe('workspace shell', () => {
  it('shows the current workspace name in the header', async () => {
    signIn(() => active(['recruiter']))
    expect(await screen.findByTitle('Workspace: Acme Hiring')).toHaveTextContent('Workspace: Acme Hiring')
  })

  it('offers Team access to HR admins only', async () => {
    signIn(() => active(['recruiter']))
    const nav = await screen.findByRole('navigation', { name: 'Account' })
    expect(within(nav).queryByRole('button', { name: /Team access/ })).not.toBeInTheDocument()
    cleanup()
    signIn(() => active(['hr_admin']))
    const adminNav = await screen.findByRole('navigation', { name: 'Account' })
    await userEvent.setup().click(within(adminNav).getByRole('button', { name: /Team access/ }))
    expect(await screen.findByRole('heading', { name: 'Team access' })).toBeVisible()
  })
})

describe('Team access page', () => {
  const request = { id: 'm1', user_id: 'u1', email: 'new@outside.com', full_name: 'New Person', email_verified: true,
    auth_provider: 'google', status: 'pending', requested_at: '2026-11-18T10:00:00Z', decided_at: null }
  const settings = { ...workspace, allowed_domains: ['acme.com'] }

  function serve(overrides: Record<string, (init?: RequestInit) => Response> = {}) {
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const key = `${init?.method ?? 'GET'} ${path(url)}`
      if (overrides[key]) return overrides[key](init)
      if (key === 'GET /api/v1/admin/membership-requests') return json([request])
      if (key === 'GET /api/v1/admin/workspace') return json(settings)
      return json({ detail: 'unexpected' }, 500)
    })
    render(<AccessManagementView />)
  }

  it('approves a request with the chosen role and removes it from the list', async () => {
    serve({ 'POST /api/v1/admin/membership-requests/m1/approve': () => json({ id: 'm1', status: 'approved', roles: ['hiring_manager'] }) })
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('Role for new@outside.com'), 'hiring_manager')
    await user.click(screen.getByRole('button', { name: 'Approve new@outside.com' }))
    expect(await screen.findByText('New Person was approved as hiring manager.')).toBeVisible()
    expect(JSON.parse(String(callsTo('/api/v1/admin/membership-requests/m1/approve')[0][1]?.body))).toEqual({ role: 'hiring_manager' })
    expect(screen.queryByRole('button', { name: 'Approve new@outside.com' })).not.toBeInTheDocument()
    expect(screen.getByText('No pending requests.')).toBeVisible()
  })

  it('rejects a request', async () => {
    serve({ 'POST /api/v1/admin/membership-requests/m1/reject': () => json({ id: 'm1', status: 'rejected' }) })
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Reject new@outside.com' }))
    expect(await screen.findByText('New Person was rejected.')).toBeVisible()
  })

  it('shows the server reason when a request was already decided', async () => {
    serve({ 'POST /api/v1/admin/membership-requests/m1/approve': () => json({ detail: 'Request is already approved' }, 409) })
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Approve new@outside.com' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Request is already approved')
  })

  it('lists decided requests when the filter changes', async () => {
    serve()
    await screen.findByRole('button', { name: 'Approve new@outside.com' })
    vi.mocked(fetch).mockImplementationOnce(async () => json([]))
    await userEvent.setup().selectOptions(screen.getByLabelText('Request status'), 'rejected')
    expect(await screen.findByText('No rejected requests.')).toBeVisible()
    expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain('status=rejected')
  })

  it('saves allowed domains and reports a conflict', async () => {
    let conflict = false
    serve({ 'PATCH /api/v1/admin/workspaces/acme/domains': init => conflict
      ? json({ detail: 'Domain already belongs to another workspace: other.com' }, 409)
      : json({ ...settings, allowed_domains: JSON.parse(String(init?.body)).allowed_domains }) })
    const user = userEvent.setup()
    const input = await screen.findByLabelText(/Domains/)
    expect(input).toHaveValue('acme.com')
    await user.clear(input)
    await user.type(input, 'acme.com, acme.io')
    await user.click(screen.getByRole('button', { name: 'Save domains' }))
    expect(await screen.findByText('Allowed domains saved.')).toBeVisible()
    expect(JSON.parse(String(callsTo('/api/v1/admin/workspaces/acme/domains')[0][1]?.body))).toEqual({ allowed_domains: ['acme.com', 'acme.io'] })
    conflict = true
    await user.type(input, ', other.com')
    await user.click(screen.getByRole('button', { name: 'Save domains' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Domain already belongs to another workspace: other.com')
  })
})
