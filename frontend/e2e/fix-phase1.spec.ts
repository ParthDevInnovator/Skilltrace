import { test, expect, type Page } from '@playwright/test'

// Fix Phase 1 acceptance: OI-07 (sign-out survives an immediate reload or no network) and
// OI-09 (a new job's requirement IDs match the server's, before and after a reload).
test.describe.configure({ mode: 'serial' })
test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'Fix Phase 1 acceptance runs once on desktop'))

const API = 'http://127.0.0.1:8000'

async function login(page: Page, email = 'recruiter@example.com') {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('Phase5Test!')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/dashboard')
}

const tokens = (page: Page) => page.evaluate(() => ({
  access: sessionStorage.getItem('mosaic.access_token'),
  refresh: sessionStorage.getItem('mosaic.refresh_token'),
}))

test('sign-out followed by an immediate reload lands on login and revokes the session (OI-07)', async ({ page }) => {
  await login(page)
  const before = await tokens(page)
  expect(before.refresh).toBeTruthy()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.reload() // no waiting: storage must already be empty
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Sign in to Skitrace' })).toBeVisible()
  expect(await tokens(page)).toEqual({ access: null, refresh: null })
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login\?next=/)
  // The keepalive revocation reached the server: the old refresh token no longer works.
  await expect.poll(async () => (await page.request.post(`${API}/api/v1/auth/refresh`, {
    data: { refresh_token: before.refresh },
  })).status()).toBe(401)
})

test('sign-out while offline still ends the local session (OI-07)', async ({ page, context }) => {
  await login(page)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
  expect(await tokens(page)).toEqual({ access: null, refresh: null })
  await context.setOffline(false)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login\?next=/)
})

async function mandatoryCounts(page: Page, candidate: string) {
  await page.getByRole('button', { name: 'Talent Pool', exact: true }).click()
  await page.getByLabel('Search talent pool').fill(candidate)
  await page.getByRole('button', { name: `Compare ${candidate}` }).click()
  await expect(page.getByRole('heading', { name: 'Candidate Comparison' })).toBeVisible()
  const row = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Mandatory Skills' }) })
    .or(page.getByRole('row').filter({ hasText: 'Mandatory Skills' }))
  await expect(row.first()).toContainText(/\d+ \/ \d+/, { timeout: 45_000 })
  return (await row.first().innerText()).match(/(\d+) \/ (\d+)/)!.slice(1).map(Number)
}

test('a new job compares with non-zero matched counts, before and after a reload (OI-09)', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const title = `Python Platform Engineer ${Date.now()}`
  await page.getByRole('button', { name: 'Create Job' }).first().click()
  await page.getByLabel('Job title').fill(title)
  await page.getByRole('button', { name: 'Save & Continue' }).click()
  await page.getByLabel('A. Paste Job Description').fill(
    'Build and operate Python services for our hiring platform.\nDesign REST APIs with FastAPI and PostgreSQL.\nWrite automated tests for backend services.')
  await page.getByRole('button', { name: 'Save Job Requirements' }).click()
  await expect(page.getByRole('heading', { name: 'Add Candidates' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to job' }).click()

  const [matched, total] = await mandatoryCounts(page, 'Alex Rivera')
  expect(total).toBeGreaterThan(0)
  expect(matched).toBeGreaterThan(0)

  // After a reload the job comes from the server; the counts must not change.
  await page.reload()
  await page.getByRole('button', { name: 'Talent Pool', exact: true }).click()
  await page.getByRole('button', { name: /Select Active Job|Engineer|Developer|Manager/ }).first().click()
  await page.getByLabel('Find a job').fill(title)
  await page.getByRole('region', { name: 'Choose active job' }).getByRole('button', { name: new RegExp(title) }).click()
  expect(await mandatoryCounts(page, 'Alex Rivera')).toEqual([matched, total])
})
