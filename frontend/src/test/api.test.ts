import { afterEach, expect, it, vi } from 'vitest'
import { api } from '@/services/api'
afterEach(() => vi.unstubAllGlobals())
it('preserves building responses and rejects failed context responses', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ candidate_id: 'CAND-001', status: 'building' }), { status: 202 })).mockResolvedValueOnce(new Response('{}', { status: 503 }))
  vi.stubGlobal('fetch', fetcher)
  expect(await api.getCandidateContext('CAND-001')).toEqual({ candidate_id: 'CAND-001', status: 'building' })
  await expect(api.getCandidateContext('CAND-001')).rejects.toThrow('503')
})
it('does not parse a JSON body for HTTP 204', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
  expect(await api.getCandidateResume('CAND-001')).toBeNull()
})
it('encodes resolve parameters and leaves multipart content type to the browser', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('[]')).mockResolvedValueOnce(new Response('{"candidate_id":"CAND-007","status":"building"}', { status: 202 }))
  vi.stubGlobal('fetch', fetcher)
  await api.resolveCandidates({ name: 'Alex Chen', email: 'alex+tag@example.com' })
  expect(fetcher.mock.calls[0][0]).toContain('email=alex%2Btag%40example.com')
  const form = new FormData()
  form.set('file', new File(['Synthetic resume'], 'resume.txt'))
  await api.uploadResume(form)
  const options = fetcher.mock.calls[1][1]
  expect(options.body).toBe(form)
  expect(options.headers).not.toHaveProperty('Content-Type')
})

it('handles match building and failed statuses separately without throwing', async () => {
 const fetcher=vi.fn().mockResolvedValueOnce(new Response('{}',{status:202})).mockResolvedValueOnce(new Response(JSON.stringify({error:'Build failed'}),{status:503})).mockResolvedValueOnce(new Response('{}',{status:404}))
 vi.stubGlobal('fetch',fetcher)
 expect(await api.getCandidateJdMatch('C',{job_id:'J'})).toEqual({status:'building'})
 expect(await api.getCandidateJdMatch('C',{job_id:'J'})).toEqual({status:'failed',error:'Build failed'})
 await expect(api.getCandidateJdMatch('C',{job_id:'J'})).rejects.toThrow()
})
it('posts matching parameters and preserves explicit reference dates',async()=>{
 const fetcher=vi.fn().mockImplementation(async()=>new Response('[]'));vi.stubGlobal('fetch',fetcher)
 await api.extractRequirements({jd_text:'Synthetic description'})
 await api.rankCandidates({job_id:'J',reference_date:'2026-10-26'})
 await api.getSimilarJobs('J')
 expect(fetcher.mock.calls.map(call=>call[0])).toEqual(['/api/v1/jd/extract','/api/v1/jd/rank','/api/v1/jd/similar'])
 expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({job_id:'J',reference_date:'2026-10-26'})
})
