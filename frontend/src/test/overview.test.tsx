import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OverviewDashboard } from '@/components/dashboard/OverviewDashboard'
import { api } from '@/services/api'
import { exampleContext } from './evidenceFixtures'

const navigation = vi.hoisted(() => ({ openJobWorkspace:vi.fn(),openCandidateDetail:vi.fn(),setActiveView:vi.fn() }))
vi.mock('@/context/JobContext', () => ({ useJob: () => ({ jobs:[],selectedJob:null,...navigation,isLoadingJobs:false,jobError:null }) }))
vi.mock('@/services/api', () => ({ api:{getCandidates:vi.fn(),getCandidateContext:vi.fn(),rankCandidates:vi.fn()} }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.getCandidates).mockResolvedValue([])
  vi.mocked(api.rankCandidates).mockResolvedValue([])
})

it('shows four real zero metrics and honest empty panels without demo records', async () => {
  render(<OverviewDashboard onOpenCustomJDModal={vi.fn()} />)
  expect(await screen.findByText('No candidate analyses yet')).toBeVisible()
  const metrics = screen.getByRole('region', {name:'Hiring metrics'})
  expect(within(metrics).getAllByText('0')).toHaveLength(4)
  expect(screen.getByText('No jobs yet')).toBeVisible()
  expect(screen.queryByText('1,240')).not.toBeInTheDocument()
  expect(screen.queryByText('Maya Chen')).not.toBeInTheDocument()
})

it('derives analyzed and evidence totals from context and opens the correct profile', async () => {
  vi.mocked(api.getCandidates).mockResolvedValue([exampleContext.candidate])
  vi.mocked(api.getCandidateContext).mockResolvedValue({...exampleContext,context_built_at:new Date().toISOString()})
  const user = userEvent.setup()
  render(<OverviewDashboard onOpenCustomJDModal={vi.fn()} />)
  const profile = await screen.findByRole('button',{name:`View ${exampleContext.candidate.full_name}'s profile`})
  expect(within(profile).getByText('Analyzed')).toBeVisible()
  expect(screen.queryByText('Verified')).not.toBeInTheDocument()
  const metrics=screen.getByRole('region',{name:'Hiring metrics'})
  const evidence=within(metrics).getByText('Evidence Discovered').closest('article')!
  expect(within(evidence).getByText(String(exampleContext.evidence_records.length))).toBeVisible()
  await user.click(profile)
  expect(navigation.openCandidateDetail).toHaveBeenCalledWith(exampleContext.candidate.id)
})

it('filters analysis activity by the selected timeframe', async () => {
  vi.mocked(api.getCandidates).mockResolvedValue([exampleContext.candidate])
  vi.mocked(api.getCandidateContext).mockResolvedValue({...exampleContext,context_built_at:'2020-01-01T00:00:00Z'})
  const user=userEvent.setup()
  render(<OverviewDashboard onOpenCustomJDModal={vi.fn()} />)
  await screen.findByText('Analyzed')
  expect(screen.queryByText(/Analysis ready for/)).not.toBeInTheDocument()
  await user.selectOptions(screen.getByRole('combobox',{name:'Analysis timeframe'}),'all')
  expect(screen.getByText(/Analysis ready for/)).toBeVisible()
})
