import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@/App'

describe('Phase 5 authentication UI',()=>{
 beforeEach(()=>{sessionStorage.clear();sessionStorage.setItem('mosaic.test_unauthenticated','true');history.replaceState({},'', '/login');vi.stubGlobal('fetch',vi.fn())})
 afterEach(()=>{cleanup();vi.unstubAllGlobals();sessionStorage.clear()})
 it('renders the login heading',()=>{render(<App/>);expect(screen.getByRole('heading',{name:'Sign in to Skitrace'})).toBeInTheDocument()})
 it('redirects the app root to login without mounting the dashboard',async()=>{
  history.replaceState({},'', '/');render(<App/>);
  expect(await screen.findByRole('heading',{name:'Sign in to Skitrace'})).toBeVisible();expect(location.pathname).toBe('/login');expect(screen.queryByRole('navigation',{name:'Workspace'})).not.toBeInTheDocument();expect(fetch).not.toHaveBeenCalled()
 })
 it('protects direct dashboard URLs and preserves the return URL',async()=>{
  history.replaceState({},'', '/dashboard');render(<App/>);expect(await screen.findByRole('heading',{name:'Sign in to Skitrace'})).toBeVisible();expect(decodeURIComponent(location.search)).toBe('?next=/dashboard');expect(screen.queryByRole('navigation',{name:'Workspace'})).not.toBeInTheDocument()
 })
 it('protects nested dashboard URLs',async()=>{
  history.replaceState({},'', '/dashboard/jobs');render(<App/>);await screen.findByRole('heading',{name:'Sign in to Skitrace'});expect(decodeURIComponent(location.search)).toBe('?next=/dashboard/jobs')
 })
 it('labels email',()=>{render(<App/>);expect(screen.getByLabelText('Email')).toHaveAttribute('type','email')})
 it('labels password',()=>{render(<App/>);expect(screen.getByLabelText('Password')).toHaveAttribute('type','password')})
 it('uses password autocomplete',()=>{render(<App/>);expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete','current-password')})
 it('uses email autocomplete',()=>{render(<App/>);expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete','email')})
 it('has a submit button',()=>{render(<App/>);expect(screen.getByRole('button',{name:'Sign in'})).toBeEnabled()})
 it('validates empty input',async()=>{render(<App/>);await userEvent.click(screen.getByRole('button',{name:'Sign in'}));expect(screen.getByLabelText('Email')).toBeInvalid()})
 it('does not use localStorage for access tokens',()=>{render(<App/>);expect(localStorage.getItem('mosaic.access_token')).toBeNull()})
 it('redirects a protected route',async()=>{history.replaceState({},'', '/candidates');render(<App/>);expect(await screen.findByRole('heading',{name:'Sign in to Skitrace'})).toBeInTheDocument();expect(location.search).toContain('next=')})
 it('preserves candidate next path',async()=>{history.replaceState({},'', '/candidates');render(<App/>);await screen.findByText('Sign in to Skitrace');expect(decodeURIComponent(location.search)).toContain('/candidates')})
 it('announces the error region',()=>{render(<App/>);expect(document.querySelector('[aria-live="assertive"]')).toBeInTheDocument()})
 it('requires email',()=>{render(<App/>);expect(screen.getByLabelText('Email')).toBeRequired()})
 it('requires password',()=>{render(<App/>);expect(screen.getByLabelText('Password')).toBeRequired()})
 it('does not create a demo session when credentials are rejected',async()=>{
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({detail:'Invalid credentials'}),{status:401}))
  const user=userEvent.setup();render(<App/>);await user.type(screen.getByLabelText('Email'),'recruiter@example.com');await user.type(screen.getByLabelText('Password'),'wrong-password');await user.click(screen.getByRole('button',{name:'Sign in'}))
  expect(await screen.findByText(/Invalid credentials/)).toBeVisible();expect(sessionStorage.getItem('mosaic.access_token')).toBeNull();expect(screen.queryByRole('heading',{name:'Recruiter Overview'})).not.toBeInTheDocument()
 })
 it('clears tokens when server identity lookup rejects an otherwise successful login',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({access_token:'rejected-identity-token',refresh_token:'refresh'}),{status:200})).mockResolvedValueOnce(new Response('{}',{status:403}))
  const user=userEvent.setup();render(<App/>);await user.type(screen.getByLabelText('Email'),'recruiter@example.com');await user.type(screen.getByLabelText('Password'),'supplied-password');await user.click(screen.getByRole('button',{name:'Sign in'}))
  expect(await screen.findByText(/Invalid credentials/)).toBeVisible();expect(sessionStorage.getItem('mosaic.access_token')).toBeNull();expect(sessionStorage.getItem('mosaic.refresh_token')).toBeNull()
 })
})
