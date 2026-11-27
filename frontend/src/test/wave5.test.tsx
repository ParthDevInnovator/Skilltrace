/** Wave 5: job lifecycle/edit/activity (OI-31), job-linked uploads (OI-30), document limits (OI-45),
 * and notifications, account and records/audit screens (OI-33). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, api } from '@/services/api'
import type { Job } from '@/types'

const job = vi.hoisted(() => ({ current: null as unknown as Job }))
const ctx = vi.hoisted(() => ({
  setActiveView: vi.fn(), setJobWorkspaceTab: vi.fn(), updateJob: vi.fn(), openCandidateDetail: vi.fn(), openJobWorkspace: vi.fn(),
  startPipeline: vi.fn(), refreshJob: vi.fn(), tab: 'overview',
}))
vi.mock('@/context/JobContext', () => ({ useJob: () => ({
  selectedJob: job.current, jobs: job.current ? [job.current] : [], jobWorkspaceTab: ctx.tab, setActiveView: ctx.setActiveView,
  setJobWorkspaceTab: ctx.setJobWorkspaceTab, updateJob: ctx.updateJob, openCandidateDetail: ctx.openCandidateDetail,
  openJobWorkspace: ctx.openJobWorkspace, startPipeline: ctx.startPipeline, refreshJob: ctx.refreshJob,
}) }))
const auth = vi.hoisted(() => ({ reloadIdentity: vi.fn(), logout: vi.fn(), roles: ['recruiter'] }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ hasRole: (role: string) => auth.roles.includes(role), reloadIdentity: auth.reloadIdentity, logout: auth.logout }) }))
vi.mock('@/components/dashboard/CandidateResultsView', () => ({ CandidateResultsView: () => null }))
vi.mock('@/components/dashboard/CandidateComparisonView', () => ({ CandidateComparisonView: () => null }))
vi.mock('@/services/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return { ApiError: actual.ApiError, api: {
    getJobActivity: vi.fn(), uploadResume: vi.fn(), getCandidateContext: vi.fn(), getNotifications: vi.fn(), markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(), getAccount: vi.fn(), updateAccount: vi.fn(), getCandidates: vi.fn(), deleteCandidate: vi.fn(), getAuditLogs: vi.fn(),
  } }
})

import { JobDetailWorkspace } from '@/components/dashboard/JobDetailWorkspace'
import { AddCandidatesView } from '@/components/dashboard/AddCandidatesView'
import { NotificationsMenu } from '@/components/layout/NotificationsMenu'
import { AccountView } from '@/components/admin/AccountView'
import { RecordsView } from '@/components/admin/RecordsView'
import { resetBatchQueue } from '@/services/batchQueue'
import { zipExpandedSize } from '@/services/documentText'

const baseJob: Job = {
  id: 'CUSTOM-1', title: 'Platform Engineer', department: 'Engineering', location: 'Pune', description_raw: 'Build Python services on Kubernetes.',
  status: 'active', is_custom: true, employment_type: 'Full-time', experience_range: '3-6 years', hiring_manager: 'Elena Marsh',
  candidate_counts: { total: 4, analyzed: 2, processing: 1, failed: 1 },
  requirements: [{ id: 'CUSTOM-1-REQ-001', requirement_text: 'Python', category: null, is_mandatory: true }],
}
beforeEach(() => { vi.resetAllMocks(); job.current = { ...baseJob }; ctx.tab = 'overview'; auth.roles = ['recruiter']; resetBatchQueue() })
afterEach(() => { cleanup(); resetBatchQueue() })

describe('job workspace (OI-31)', () => {
  it('shows status, structured fields and real counts, and changes the status', async () => {
    const user = userEvent.setup()
    ctx.updateJob.mockResolvedValue({ ...baseJob, status: 'closed' })
    render(<JobDetailWorkspace />)
    expect(screen.getByText('Active', { selector: '.job-status-badge' })).toBeVisible()
    expect(screen.getByText(/Full-time · 3-6 years · Hiring manager: Elena Marsh/)).toBeVisible()
    expect(screen.getByLabelText('Total candidates: 4')).toBeVisible()
    expect(screen.getByText(/1 candidate on this job could not be analyzed/)).toBeVisible()
    await user.selectOptions(screen.getByLabelText('Job status'), 'closed')
    expect(ctx.updateJob).toHaveBeenCalledWith('CUSTOM-1', { status: 'closed' })
  })

  it('disables adding resumes to a closed job and editing a bundled job', () => {
    job.current = { ...baseJob, status: 'closed', is_custom: false }
    render(<JobDetailWorkspace />)
    expect(screen.getAllByRole('button', { name: /Add Resumes/ })[0]).toBeDisabled()
    expect(screen.getByRole('button', { name: /Edit/ })).toBeDisabled()
    expect(screen.queryByLabelText('Job status')).not.toBeInTheDocument()
    expect(screen.getByText(/This job is closed/)).toBeVisible()
  })

  it('edits fields and requirements, sending only what changed', async () => {
    const user = userEvent.setup()
    ctx.updateJob.mockResolvedValue(baseJob)
    render(<JobDetailWorkspace />)
    await user.click(screen.getByRole('button', { name: /Edit/ }))
    const dialog = screen.getByRole('dialog', { name: 'Edit job' })
    await user.clear(within(dialog).getByLabelText('Job title')); await user.type(within(dialog).getByLabelText('Job title'), 'Senior Platform Engineer')
    await user.clear(within(dialog).getByLabelText('Hiring manager'))
    await user.type(within(dialog).getByLabelText('Add requirement'), 'Terraform{Enter}')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(ctx.updateJob).toHaveBeenCalledWith('CUSTOM-1', {
      title: 'Senior Platform Engineer', hiring_manager: null,
      requirements: [{ id: 'CUSTOM-1-REQ-001', requirement_text: 'Python', category: null, is_mandatory: true },
        { id: 'draft-2', requirement_text: 'Terraform', category: null, is_mandatory: true }],
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows server errors from an edit and keeps the dialog open', async () => {
    const user = userEvent.setup()
    ctx.updateJob.mockRejectedValue(new ApiError(422, '/api/v1/jobs/CUSTOM-1', JSON.stringify({ detail: 'Title cannot be empty.' })))
    render(<JobDetailWorkspace />)
    await user.click(screen.getByRole('button', { name: /Edit/ }))
    await user.type(screen.getByLabelText('Location'), ' Office')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Title cannot be empty.')
    expect(screen.getByRole('dialog')).toBeVisible()
  })

  it('lists job activity from the server', async () => {
    ctx.tab = 'activity'
    vi.mocked(api.getJobActivity).mockResolvedValue([
      { id: 'e2', job_id: 'CUSTOM-1', kind: 'status_changed', actor_name: 'Tara', detail: { from: 'active', to: 'closed' }, occurred_at: '2026-11-27T10:00:00Z' },
      { id: 'e1', job_id: 'CUSTOM-1', kind: 'candidate_added', actor_name: 'Casey', candidate_id: 'C-9', detail: { source: 'upload' }, occurred_at: '2026-11-26T10:00:00Z' },
    ])
    const user = userEvent.setup()
    render(<JobDetailWorkspace />)
    expect(await screen.findByText('Tara changed the status from active to closed')).toBeVisible()
    expect(screen.getByText('Casey added a candidate by uploading a resume')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'View candidate' }))
    expect(ctx.openCandidateDetail).toHaveBeenCalledWith('C-9')
  })
})

describe('job-linked uploads (OI-30)', () => {
  it('sends the selected job with each batch upload', async () => {
    const user = userEvent.setup()
    vi.mocked(api.uploadResume).mockResolvedValue({ candidate_id: 'C1', status: 'building', context_revision: 'r1' })
    vi.mocked(api.getCandidateContext).mockResolvedValue({ candidate_id: 'C1', status: 'building' })
    render(<AddCandidatesView />)
    expect(screen.getByText(/Uploaded candidates are added to/)).toBeVisible()
    await user.upload(screen.getByLabelText('Batch resume files'), [new File(['resume'], 'a.txt', { type: 'text/plain' })])
    await user.click(screen.getByRole('button', { name: 'Start Batch Analysis (1)' }))
    await waitFor(() => expect(api.uploadResume).toHaveBeenCalled())
    expect((vi.mocked(api.uploadResume).mock.calls[0][0] as FormData).get('job_id')).toBe('CUSTOM-1')
  })

  it('blocks uploads for a closed job', () => {
    job.current = { ...baseJob, status: 'closed' }
    render(<AddCandidatesView />)
    expect(screen.getByRole('alert')).toHaveTextContent('Platform Engineer is closed')
    expect(screen.queryByLabelText('Batch resume files')).not.toBeInTheDocument()
  })
})

describe('notifications, account and records (OI-33)', () => {
  const notification = { id: 'n1', kind: 'analysis_ready', title: 'Ana is analyzed', body: 'Evidence is ready.', candidate_id: 'C-1', created_at: '2026-11-27T10:00:00Z', read_at: null }

  it('shows the unread count, opens the candidate and marks it read', async () => {
    const user = userEvent.setup()
    vi.mocked(api.getNotifications).mockResolvedValue({ items: [notification], unread_count: 1 })
    vi.mocked(api.markNotificationRead).mockResolvedValue(null)
    render(<NotificationsMenu />)
    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' })
    await user.click(bell)
    await user.click(await screen.findByRole('button', { name: /Ana is analyzed/ }))
    expect(api.markNotificationRead).toHaveBeenCalledWith('n1')
    expect(ctx.openCandidateDetail).toHaveBeenCalledWith('C-1')
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeVisible()
  })

  it('updates the account name and refreshes the signed-in identity', async () => {
    const user = userEvent.setup()
    const profile = { user_id: 'u1', email: 'r@acme.com', full_name: 'Old Name', roles: ['recruiter'], status: 'active' as const, email_verified: true, auth_provider: 'native', workspace: { id: 'acme', name: 'Acme' } }
    vi.mocked(api.getAccount).mockResolvedValue(profile)
    vi.mocked(api.updateAccount).mockResolvedValue({ ...profile, full_name: 'New Name' })
    render(<AccountView />)
    const name = await screen.findByLabelText('Full name')
    expect(screen.getByText('Email and password')).toBeVisible()
    await user.clear(name); await user.type(name, '  New   Name ')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(api.updateAccount).toHaveBeenCalledWith('New Name')
    expect(await screen.findByText('Your name was updated.')).toBeVisible()
    expect(auth.reloadIdentity).toHaveBeenCalled()
  })

  it('keeps Clerk-managed names read-only', async () => {
    vi.mocked(api.getAccount).mockResolvedValue({ user_id: 'u1', email: 'c@acme.com', full_name: 'Clerk User', roles: ['recruiter'], status: 'active', email_verified: true, auth_provider: 'clerk' })
    render(<AccountView />)
    expect(await screen.findByLabelText('Full name')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save profile' })).not.toBeInTheDocument()
  })

  it('deletes a candidate only after the name is typed, and reviews the audit log', async () => {
    const user = userEvent.setup()
    vi.mocked(api.getCandidates).mockResolvedValue([{ id: 'C-1', full_name: 'Ana Member', email: 'ana@example.com', headline: 'Engineer', location: 'Pune', top_skills: [] }])
    vi.mocked(api.deleteCandidate).mockResolvedValue(null)
    vi.mocked(api.getAuditLogs).mockResolvedValue([{ id: 'a1', user_id: 'u1', user_email: 'admin@acme.com', user_name: 'Audit Admin', role_snapshot: 'hr_admin', endpoint: '/candidates/C-0', method: 'DELETE', candidate_id: 'C-0', action_type: 'DELETE', occurred_at: '2026-11-27T10:00:00Z', status_code: 204, detail: null }])
    render(<RecordsView />)
    expect(await screen.findByText('Audit Admin')).toBeVisible()
    await user.click(await screen.findByRole('button', { name: 'Delete Ana Member' }))
    const confirm = screen.getByRole('button', { name: 'Delete permanently' })
    expect(confirm).toBeDisabled()
    await user.type(screen.getByLabelText("Type the candidate's full name to confirm"), 'Ana Member')
    await user.click(confirm)
    expect(api.deleteCandidate).toHaveBeenCalledWith('C-1')
    expect(await screen.findByText(/Ana Member and all of their data were deleted/)).toBeVisible()
    await user.selectOptions(screen.getByLabelText('Action'), 'DELETE')
    await user.type(screen.getByLabelText('From'), '2026-11-01')
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))
    await waitFor(() => expect(api.getAuditLogs).toHaveBeenLastCalledWith({ action_type: 'DELETE', candidate_id: undefined, date_from: '2026-11-01T00:00:00Z', date_to: undefined, page: 1, page_size: 50 }))
  })
})

describe('job description documents (OI-45)', () => {
  /** A minimal ZIP central directory with the given uncompressed sizes. */
  function zip(sizes: number[]) {
    const entries = sizes.map(size => { const header = new Uint8Array(46); const view = new DataView(header.buffer); view.setUint32(0, 0x02014b50, true); view.setUint32(24, size, true); return header })
    const directory = entries.reduce((total, entry) => total + entry.length, 0)
    const end = new Uint8Array(22); const view = new DataView(end.buffer)
    view.setUint32(0, 0x06054b50, true); view.setUint16(10, sizes.length, true); view.setUint32(12, directory, true); view.setUint32(16, 0, true)
    const bytes = new Uint8Array(directory + 22); let offset = 0
    for (const entry of entries) { bytes.set(entry, offset); offset += entry.length }
    bytes.set(end, offset)
    return bytes
  }
  it('sums the expanded size of a DOCX like the backend parser', () => {
    expect(zipExpandedSize(zip([1000, 2500]))).toBe(3500)
    expect(zipExpandedSize(zip([15 * 1024 * 1024, 6 * 1024 * 1024]))).toBeGreaterThan(20 * 1024 * 1024)
    expect(() => zipExpandedSize(new Uint8Array(40))).toThrow('damaged')
  })
})
