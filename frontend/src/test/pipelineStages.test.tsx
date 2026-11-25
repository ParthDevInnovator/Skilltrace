import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PipelineAnalysisView } from '@/components/dashboard/PipelineAnalysisView'
import { api } from '@/services/api'
import { exampleContext } from './evidenceFixtures'
import type { BuildStage, BuildStageName } from '@/types/context'
import type { CandidateMatchResult } from '@/types/matching'

let selectedJob: { id: string; title: string } | null = { id: 'J', title: 'Backend Engineer' }
vi.mock('@/context/JobContext', () => ({ useJob: () => ({ selectedCandidateId: 'C1', selectedJob, openCandidateDetail: vi.fn(), setActiveView: vi.fn() }) }))
vi.mock('@/components/profile/ResumeViewer', () => ({ ResumeViewer: () => null }))
vi.mock('@/services/api', async importOriginal => ({
  ApiError: (await importOriginal<typeof import('@/services/api')>()).ApiError,
  api: { getCandidateContext: vi.fn(), getCandidateJdMatch: vi.fn(), extractRequirements: vi.fn(), rebuildCandidateContext: vi.fn() },
}))

const at = (s: number) => `2026-11-23T10:00:0${s}Z`
const stage = (name: BuildStageName, state: BuildStage['state'], item_count: number | null = null, start = 0, end = 1): BuildStage =>
  ({ name, state, item_count, started_at: state === 'pending' ? null : at(start), finished_at: ['pending', 'running'].includes(state) ? null : at(end) })
const item = (title: string) => screen.getByRole('heading', { name: new RegExp(`^${title}`) }).closest('li')!
const match: CandidateMatchResult = { candidate_id: 'C1', job_id: 'J', reference_date: '2026-11-23', resume_fit: .7, evidence_strength: .6, final_score: .72, result_built_at: at(5),
  coverage: [{ requirement_id: 'R1', coverage_state: 'matched', claim_ids: [], evidence_record_ids: [], coverage_weight: 1, evidence_strength: 1, observation: '' }, { requirement_id: 'R2', coverage_state: 'insufficient_evidence', claim_ids: [], evidence_record_ids: [], coverage_weight: 1, evidence_strength: 0, observation: '' }] }

beforeEach(() => {
  vi.resetAllMocks()
  selectedJob = { id: 'J', title: 'Backend Engineer' }
  vi.mocked(api.extractRequirements).mockResolvedValue([])
  vi.mocked(api.getCandidateJdMatch).mockResolvedValue(match)
})

it('shows each measured stage while the build runs, not one aggregate (OI-28)', async () => {
  vi.mocked(api.getCandidateContext).mockResolvedValue({ candidate_id: 'C1', status: 'building', stages: [
    stage('resume_parse', 'complete', 900), stage('claim_extraction', 'complete', 4, 1, 2), stage('github', 'running'),
    stage('leetcode', 'unavailable'), stage('linkedin', 'skipped', 0), stage('scoring', 'pending'),
  ] })
  render(<PipelineAnalysisView />)
  expect(await screen.findByText('67% of build steps done')).toBeVisible()
  expect(within(item('Resume Extraction')).getByText(/4 resume claims extracted · 1.0 s/)).toBeVisible()
  expect(within(item('GitHub Evidence')).getByRole('heading')).toHaveTextContent('In progress')
  expect(within(item('LeetCode Evidence')).getByText(/outage, not missing evidence/)).toBeVisible()
  expect(within(item('LinkedIn Evidence')).getByText(/No profile link/)).toBeVisible()
  expect(within(item('Project Analysis')).getByRole('heading')).toHaveTextContent('Pending')
  expect(within(item('Job Matching')).getByRole('heading')).toHaveTextContent('Pending')
  expect(api.getCandidateJdMatch).not.toHaveBeenCalled()
})

it('runs job matching once ready and counts repository evidence as projects (OI-28)', async () => {
  const github = exampleContext.evidence_records.filter(record => record.source_type === 'github').length
  vi.mocked(api.getCandidateContext).mockResolvedValue({ ...exampleContext, build_stages: [
    stage('resume_parse', 'complete'), stage('claim_extraction', 'complete', exampleContext.claims.length), stage('github', 'complete', github),
    stage('leetcode', 'complete', 0), stage('linkedin', 'skipped', 0), stage('scoring', 'complete', exampleContext.evidence_records.length),
  ] })
  render(<PipelineAnalysisView />)
  expect(await screen.findByText(/Fit 72\/100 for Backend Engineer · 1 of 2 requirements matched/)).toBeVisible()
  expect(within(item('Job Matching')).getByRole('heading')).toHaveTextContent('Completed')
  const projects = exampleContext.evidence_records.filter(record => record.source_type === 'github' || record.source_type === 'project_submission').length
  expect(within(item('Project Analysis')).getByText(new RegExp(`^${projects} repository or project observation`))).toBeVisible()
  expect(within(item('Claim Review')).getByText(/not automatically verified/)).toBeVisible()
  expect(within(item('LeetCode Evidence')).getByText('Profile read; no observations returned · 1.0 s')).toBeVisible()
})

it('says when a job must be selected before matching', async () => {
  selectedJob = null
  vi.mocked(api.getCandidateContext).mockResolvedValue(exampleContext)
  render(<PipelineAnalysisView />)
  expect(await screen.findByText('Select a job to evaluate candidate fit')).toBeVisible()
  expect(screen.getByText(/built before they were recorded/)).toBeVisible()
})
