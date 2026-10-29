import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@/App'

describe('Phase 5 authentication UI',()=>{
 beforeEach(()=>{sessionStorage.clear();sessionStorage.setItem('mosaic.test_unauthenticated','true');history.replaceState({},'', '/login');vi.stubGlobal('fetch',vi.fn())})
 afterEach(()=>{cleanup();vi.unstubAllGlobals();sessionStorage.clear()})
 it('renders the login heading',()=>{render(<App/>);expect(screen.getByRole('heading',{name:'Sign in to Mosaic'})).toBeInTheDocument()})
 it('labels email',()=>{render(<App/>);expect(screen.getByLabelText('Email')).toHaveAttribute('type','email')})
 it('labels password',()=>{render(<App/>);expect(screen.getByLabelText('Password')).toHaveAttribute('type','password')})
 it('uses password autocomplete',()=>{render(<App/>);expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete','current-password')})
 it('uses email autocomplete',()=>{render(<App/>);expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete','email')})
 it('has a submit button',()=>{render(<App/>);expect(screen.getByRole('button',{name:'Sign in'})).toBeEnabled()})
 it('validates empty input',async()=>{render(<App/>);await userEvent.click(screen.getByRole('button',{name:'Sign in'}));expect(screen.getByLabelText('Email')).toBeInvalid()})
 it('does not use localStorage for access tokens',()=>{render(<App/>);expect(localStorage.getItem('mosaic.access_token')).toBeNull()})
 it('redirects a protected route',async()=>{history.replaceState({},'', '/candidates');render(<App/>);expect(await screen.findByRole('heading',{name:'Sign in to Mosaic'})).toBeInTheDocument();expect(location.search).toContain('next=')})
 it('preserves candidate next path',async()=>{history.replaceState({},'', '/candidates');render(<App/>);await screen.findByText('Sign in to Mosaic');expect(decodeURIComponent(location.search)).toContain('/candidates')})
 it('announces the error region',()=>{render(<App/>);expect(document.querySelector('[aria-live="assertive"]')).toBeInTheDocument()})
 it('requires email',()=>{render(<App/>);expect(screen.getByLabelText('Email')).toBeRequired()})
 it('requires password',()=>{render(<App/>);expect(screen.getByLabelText('Password')).toBeRequired()})
})
