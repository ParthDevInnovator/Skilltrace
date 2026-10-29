import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '@playwright/test'

test('grounded chat, brief, questions and downloads are accessible', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button',{name:'Chat',exact:true}).click()
  await page.getByLabel('Message').fill("What is CAND-001's strongest skill?")
  await page.getByRole('button',{name:'Send'}).click()
  await expect(page.locator('.chat-turn.assistant')).toContainText('strongest grounded signal')
  await expect(page.locator('.chat-turn.assistant .source-chip')).toHaveCount(1)
  await page.getByRole('button',{name:'Close chat'}).click()

  await page.getByRole('button',{name:'View Profile'}).first().click()
  await page.getByRole('button',{name:'Brief & Questions'}).click()
  await page.getByRole('button',{name:'Generate Brief'}).click()
  for (const title of ['Strengths','Evidence Summary','Application History Notes','Identified Gaps'])
    await expect(page.getByRole('heading',{name:title})).toBeVisible()
  await page.getByRole('button',{name:'Copy to Clipboard'}).click()
  await expect(page.getByText('Copied to clipboard.')).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button',{name:'Download as TXT'}).click()
  expect((await download).suggestedFilename()).toBe('CAND-001-brief.txt')

  await page.getByRole('button',{name:'Interview Questions'}).click()
  await page.getByRole('button',{name:'Generate Questions'}).click()
  await expect(page.locator('.question-list li')).toHaveCount(3)
  await page.locator('.question-list summary').first().click()
  await expect(page.locator('.question-list .source-chip').first()).toBeVisible()
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([])
})

test('Phase 4 APIs are grounded and graph degrades gracefully', async ({page,request}) => {
  const root='http://127.0.0.1:8000/api/v1'
  const chat=await request.post(root+'/agent/chat',{data:{message:"What is CAND-001's strongest skill?",history:[],job_id:'JOB-001'}})
  expect(chat.status()).toBe(200);expect((await chat.json()).grounding_ids.length).toBeGreaterThan(0)
  const brief=await request.post(root+'/candidates/CAND-001/brief',{data:{job_id:'JOB-001'}})
  expect(brief.status()).toBe(200);expect(await brief.json()).toMatchObject({candidate_id:'CAND-001'})
  const questions=await request.post(root+'/candidates/CAND-001/interview-questions',{data:{job_id:'JOB-001'}})
  expect(questions.status()).toBe(200);expect((await questions.json()).questions.length).toBeGreaterThanOrEqual(3)
  expect((await request.get(root+'/candidates/CAND-001/graph')).status()).toBe(503)

  await page.goto('/');await page.getByRole('button',{name:'View Profile'}).first().click();await page.getByRole('button',{name:'Knowledge Graph'}).click()
  await expect(page.getByText(/Knowledge graph is not available/)).toBeVisible()
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([])
})
