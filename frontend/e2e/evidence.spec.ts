import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '@playwright/test'

test('Explorer filters, provenance, audit trails, resume and accessibility', async ({ page }, info) => {
  test.setTimeout(60000)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Evidence Explorer', exact: true }).click()
  await expect(page.locator('.explorer-row')).toHaveCount(6)
  await expect(page.getByRole('meter')).toHaveCount(6)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
  await page.evaluate(() => scrollTo(0, 0))
  await page.screenshot({ path: `test-results/${info.project.name}-explorer.png`, fullPage: true })
  await page.getByLabel('Evidence tier').selectOption('Strong')
  await expect(page.locator('.explorer-row')).toHaveCount(1)
  await page.getByLabel('Source type').selectOption('linkedin')
  await expect(page.locator('.explorer-row')).toHaveCount(1)
  await page.getByLabel('Minimum evidence score').fill('100')
  await expect(page.getByText('No candidates match the evidence filters.')).toBeVisible()
  await page.getByLabel('Minimum evidence score').fill('0')
  await page.getByRole('button', { name: 'Inspect Alex Rivera' }).click()
  await expect(page.getByRole('heading', { name: 'Alex Rivera', exact: true })).toBeVisible()
  await expect(page.getByText('unverified', { exact: true })).toBeVisible()
  const card = page.locator('.evidence-card').filter({ hasText: 'Synthetic LinkedIn stub mentions Python.' })
  await expect(card.locator('.provenance-label')).toContainText('synthetic')
  const toggle = card.getByRole('button')
  await toggle.focus(); await page.keyboard.press('Enter')
  await expect(card.getByRole('link', { name: 'Inspect source' })).toHaveAttribute('href', 'https://example.test/synthetic-linkedin')
  await expect(card.getByText('Weight: 1 x 0.7 = 0.7')).toBeVisible()
  const profileScan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(profileScan.violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => scrollTo(0, 0))
  await page.screenshot({ path: `test-results/${info.project.name}-evidence-profile.png`, fullPage: true })
  await page.getByRole('button', { name: 'Reported Skills' }).click()
  await expect(page.locator('.skill-evidence-row')).not.toHaveCount(0)
  await page.getByRole('button', { name: 'Resume Reference', exact: true }).click()
  await expect(page.getByText('STUB', { exact: true })).toBeVisible()
  await expect(page.locator('.resume-text')).toContainText('SYNTHETIC DEMO RESUME')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => scrollTo(0, 0))
  await page.screenshot({ path: `test-results/${info.project.name}-evidence-resume.png`, fullPage: true })
  expect(errors).toEqual([])
})

test('cards and profile handle building, failed and ready contexts', async ({ page }) => {
  let mode: 'building' | 'failed' | 'ready' = 'building'
  await page.route('**/api/v1/candidates/CAND-001/context', async route => {
    if (mode === 'building') return route.fulfill({ status: 202, json: { candidate_id: 'CAND-001', status: 'building' } })
    if (mode === 'failed') return route.fulfill({ status: 503, json: { detail: 'Synthetic failure' } })
    return route.continue()
  })
  await page.goto('/')
  await expect(page.getByText('Unassessed', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'View Profile' }).first().click()
  await expect(page.getByText('Building candidate context...')).toBeVisible()
  mode = 'failed'
  await expect(page.getByRole('button', { name: 'Retry evidence' })).toBeVisible({ timeout: 10000 })
  mode = 'ready'
  await page.getByRole('button', { name: 'Retry evidence' }).click()
  await expect(page.locator('.evidence-card')).toHaveCount(5)
})

test('empty resume, Explorer failure and retry, rebuild protection', async ({ page, request }) => {
  await page.route('**/api/v1/candidates/CAND-001/resume', route => route.fulfill({ status: 204 }))
  await page.goto('/')
  await page.getByRole('button', { name: 'View Profile' }).first().click()
  await page.getByRole('button', { name: 'Resume Reference', exact: true }).click()
  await expect(page.getByText('No resume text is available.')).toBeVisible()
  await page.route('**/api/v1/candidates', route => route.fulfill({ status: 500, json: {} }))
  await page.getByRole('button', { name: 'Evidence Explorer', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry explorer' })).toBeVisible()
  await page.unroute('**/api/v1/candidates')
  await page.getByRole('button', { name: 'Retry explorer' }).click()
  await expect(page.locator('.explorer-row')).toHaveCount(6)
  expect((await request.post('http://127.0.0.1:8000/seed/rebuild')).status()).toBe(403)
})

test('all context APIs and identity resolution are available', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:8000/api/v1/candidates')
  const candidates = await response.json()
  for (const candidate of candidates) {
    await expect.poll(async () => (await request.get(`http://127.0.0.1:8000/api/v1/candidates/${candidate.id}/context`)).status()).toBe(200)
  }
  const matches = await (await request.get('http://127.0.0.1:8000/candidates/resolve?name=Alex')).json()
  expect(matches[0].id).toBe('CAND-001')
})


test('resume upload form updates a candidate and opens the original text', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Candidates', exact: true }).click()
  await page.getByText('Upload candidate resume', { exact: true }).click()
  const resume = 'Name: David Kim\nEmail: david.kim@example.com\nTitle: Backend Engineer\nExperience\n- Built reliable Python and FastAPI services for enterprise customers.'
  await page.getByLabel('Resume file', { exact: true }).setInputFiles({ name: 'david.txt', mimeType: 'text/plain', buffer: Buffer.from(resume) })
  await page.getByRole('button', { name: 'Upload and inspect candidate' }).click()
  await expect(page.getByRole('heading', { name: 'David Kim', exact: true })).toBeVisible()
  await expect(page.getByText('unverified', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Resume Reference', exact: true }).click()
  await expect(page.getByText('TXT', { exact: true })).toBeVisible()
  await expect(page.locator('.resume-text')).toContainText('enterprise customers')
})
