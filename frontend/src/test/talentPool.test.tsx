import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TalentPoolView } from '@/components/dashboard/TalentPoolView'
import { api } from '@/services/api'
const openCandidateDetail = vi.fn()
const setActiveView = vi.fn()
vi.mock('@/context/JobContext', () => ({ useJob: () => ({ selectedJob: { id: 'J1', title: 'Engineer' }, searchQuery: '', openCandidateDetail, setActiveView }) }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ hasRole: () => true }) }))
vi.mock('@/services/api', () => ({ api: { getCandidates: vi.fn(), rankCandidates: vi.fn(), getCandidateById: vi.fn() } }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.getCandidates).mockResolvedValue([
    { id: 'A', full_name: 'Maya Chen', email: '', headline: 'Backend Engineer', location: 'Berlin', top_skills: ['Python'] },
    { id: 'B', full_name: 'Jonas Weber', email: '', headline: 'Engineer', location: 'Munich', top_skills: ['React'] },
  ])
  vi.mocked(api.rankCandidates).mockResolvedValue([])
})
it('filters by reported skill and search, then opens intelligence', async () => {
  const user = userEvent.setup()
  render(<TalentPoolView />)
  await screen.findByText('Maya Chen')
  await user.selectOptions(screen.getByLabelText('Filter by skill'), 'Python')
  expect(screen.queryByText('Jonas Weber')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  await user.type(screen.getByLabelText('Search talent pool'), 'Munich')
  expect(screen.queryByText('Maya Chen')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'View Intelligence for Jonas Weber' }))
  expect(openCandidateDetail).toHaveBeenCalledWith('B')
})
it('retains selected candidate when opening comparison and routes resume upload', async () => {
  const user = userEvent.setup()
  render(<TalentPoolView />)
  await user.click(await screen.findByRole('button', { name: 'Compare Maya Chen' }))
  expect(openCandidateDetail).toHaveBeenCalledWith('A')
  expect(setActiveView).toHaveBeenCalledWith('comparison')
  await user.click(screen.getByRole('button', { name: 'Add Resumes' }))
  expect(setActiveView).toHaveBeenCalledWith('add-candidates')
})
