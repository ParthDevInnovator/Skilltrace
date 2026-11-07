import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClerkIdentity } from '@/context/ClerkIdentity'
import { useAuth } from '@/context/AuthContext'

const clerk = vi.hoisted(() => ({
  getToken: vi.fn(), signOut: vi.fn(),
  profile: {
    id: 'clerk-profile-1', fullName: 'Morgan Example' as string | null,
    hasImage: true, imageUrl: 'https://img.clerk.com/test-avatar.png',
    username: null as string | null,
    primaryEmailAddress: { emailAddress: 'morgan@example.com' },
    publicMetadata: { roles: ['hr_admin'] },
  },
}))
vi.mock('@clerk/react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, sessionId: 'session-1', userId: 'clerk-profile-1', getToken: clerk.getToken, signOut: clerk.signOut }),
  useUser: () => ({ isLoaded: true, user: clerk.profile }),
}))

function Account() {
  const auth = useAuth()
  return <><p>{auth.ready ? 'Identity checked' : 'Checking identity'}</p><p>{auth.user?.full_name ?? 'Signed out'}</p><p>{auth.user?.email}</p><p>{auth.user?.image_url}</p><p>{auth.hasRole('hr_admin') ? 'Admin access' : 'No admin access'}</p><p>{auth.isAuthenticated ? 'Authenticated' : 'Unauthenticated'}</p></>
}
beforeEach(() => {
  clerk.profile.fullName = 'Morgan Example'; clerk.profile.username = null
  clerk.getToken.mockResolvedValue('valid-clerk-session')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    user_id: 'database-id', full_name: 'Clerk user', email: 'clerk-profile-1@clerk.local', roles: ['recruiter'],
  }))))
})
afterEach(() => vi.unstubAllGlobals())

it('uses the signed-in Clerk name and email while retaining server permissions', async () => {
  render(<ClerkIdentity><Account /></ClerkIdentity>)
  expect(await screen.findByText('Morgan Example')).toBeVisible()
  expect(screen.getByText('morgan@example.com')).toBeVisible()
  expect(screen.getByText('https://img.clerk.com/test-avatar.png')).toBeVisible()
  expect(screen.getByText('No admin access')).toBeVisible()
  expect(screen.queryByText('Clerk user')).not.toBeInTheDocument()
  expect(screen.getByText('Authenticated')).toBeVisible()
})
it('uses the account email if the profile has no name or username', async () => {
  clerk.profile.fullName = null
  render(<ClerkIdentity><Account /></ClerkIdentity>)
  expect(await screen.findByText('Authenticated')).toBeVisible()
  expect(screen.getAllByText('morgan@example.com')).toHaveLength(2)
  expect(screen.queryByText('Clerk user')).not.toBeInTheDocument()
})
it('does not authenticate a Clerk profile when the server rejects its session', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 401 }))
  render(<ClerkIdentity><Account /></ClerkIdentity>)
  await screen.findByText('Identity checked')
  expect(screen.getByText('Signed out')).toBeVisible()
  expect(screen.getByText('Unauthenticated')).toBeVisible()
  expect(screen.queryByText('Morgan Example')).not.toBeInTheDocument()
})
