import {test,expect} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe.configure({mode:'serial'})
test.beforeEach(async({},info)=>test.skip(info.project.name!=='desktop','Phase 5 acceptance runs once on desktop'))

async function login(page:any,email:string){
 await page.goto('/login');await page.getByLabel('Email').fill(email);await page.getByLabel('Password').fill('Phase5Test!');await page.getByRole('button',{name:'Sign in'}).click();await expect(page).toHaveURL('/')
}

test('full authenticated recruiter flow',async({page})=>{
 await login(page,'recruiter@example.com');await expect(page.getByText('Recruiter Test')).toBeVisible()
 await page.getByRole('button',{name:'Candidates',exact:true}).click();await page.getByLabel('Search candidates',{exact:true}).fill('Alex Rivera');await page.getByRole('button',{name:'View Profile'}).click()
 await page.getByRole('button',{name:'Brief & Questions'}).click();await expect(page.getByRole('button',{name:'Generate Brief'})).toBeVisible()
 await page.getByRole('button',{name:'Generate Brief'}).click();await expect(page.getByRole('heading',{name:'Strengths'})).toBeVisible()
 for(const heading of ['Strengths','Evidence Summary','Application History Notes','Identified Gaps'])await expect(page.getByRole('heading',{name:heading})).toBeVisible()
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([])
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download as TXT'}).click();expect((await download).suggestedFilename()).toContain('CAND-001')
 await page.getByRole('button',{name:'Sign out'}).click();await expect(page).toHaveURL(/\/login/)
})

test('hiring manager has evidence and questions but no brief generation',async({page})=>{
 await login(page,'manager@example.com');await page.getByRole('button',{name:'Candidates',exact:true}).click();await page.getByLabel('Search candidates',{exact:true}).fill('Alex Rivera');await page.getByRole('button',{name:'View Profile'}).click()
 await expect(page.getByRole('button',{name:'Evidence & Claims'})).toBeVisible();await page.getByRole('button',{name:'Brief & Questions'}).click();await expect(page.getByRole('button',{name:'Interview Questions'})).toBeVisible();await expect(page.getByRole('button',{name:'Generate Brief'})).toHaveCount(0)
})

test('unauthenticated candidate route redirects and login is axe clean',async({page})=>{
 await page.goto('/candidates');await expect(page).toHaveURL(/\/login\?next=/);await expect(page.getByRole('heading',{name:/sign in/i})).toBeVisible();expect((await new AxeBuilder({page}).analyze()).violations).toEqual([])
})

test('403 and 404 pages have descriptive navigation and are axe clean',async({page})=>{
 await page.goto('/403');await expect(page.getByRole('heading',{name:/403/})).toBeVisible();await expect(page.getByRole('link',{name:/home/i})).toBeVisible();expect((await new AxeBuilder({page}).analyze()).violations).toEqual([])
 await page.goto('/does-not-exist');await expect(page.getByRole('heading',{name:/404/})).toBeVisible();await expect(page.getByRole('link',{name:/home/i})).toBeVisible();expect((await new AxeBuilder({page}).analyze()).violations).toEqual([])
})

test('HR administrator can perform atomic GDPR deletion',async({page})=>{
 await login(page,'admin@example.com');const token=await page.evaluate(()=>sessionStorage.getItem('mosaic.access_token'));expect(token).toBeTruthy()
 const response=await page.request.delete('http://127.0.0.1:8000/api/v1/candidates/CAND-001',{headers:{Authorization:`Bearer ${token}`}});expect(response.status()).toBe(204)
 const missing=await page.request.get('http://127.0.0.1:8000/api/v1/candidates/CAND-001',{headers:{Authorization:`Bearer ${token}`}});expect(missing.status()).toBe(404)
 await page.goto('/');await page.getByRole('button',{name:'Candidates',exact:true}).click();await page.getByLabel('Search candidates',{exact:true}).fill('Alex Rivera');await expect(page.getByText('No Candidates Found')).toBeVisible()
})
