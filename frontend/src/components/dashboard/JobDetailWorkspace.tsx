import { useState } from 'react'
import { useJob } from '@/context/JobContext'
import { useAuth } from '@/context/AuthContext'
import { ApiError } from '@/services/api'
import { JOB_STATUSES, isOpenJob, type JobLifecycleStatus } from '@/types'
import { JobStatusBadge, STATUS_LABEL } from '@/components/common/JobStatusBadge'
import { CandidateResultsView } from './CandidateResultsView'
import { CandidateComparisonView } from './CandidateComparisonView'
import { JobEditDialog } from './JobEditDialog'
import { JobActivity } from './JobActivity'

function Icon({ name }: { name: string }) {
  return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>
}

export function JobDetailWorkspace() {
  const { selectedJob, setActiveView, jobWorkspaceTab, setJobWorkspaceTab, updateJob, openCandidateDetail } = useJob()
  const { hasRole } = useAuth()
  const [editing, setEditing] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState('')
  if (!selectedJob) return <section className="panel"><h1>Select a job</h1><button onClick={() => setActiveView('jobs')}>Browse jobs</button></section>
  const canEdit = hasRole('recruiter') && !!selectedJob.is_custom
  const open = isOpenJob(selectedJob)
  const employment = selectedJob.employment_type ?? selectedJob.description_raw.match(/Employment type:\s*([^\n]+)/i)?.[1]
  const mandatory = selectedJob.requirements?.filter(requirement => requirement.is_mandatory) ?? []
  const preferred = selectedJob.requirements?.filter(requirement => !requirement.is_mandatory) ?? []
  const created = selectedJob.created_at ? new Date(selectedJob.created_at) : null
  const metadata = [selectedJob.department, selectedJob.location, employment, selectedJob.experience_range,
    selectedJob.hiring_manager && `Hiring manager: ${selectedJob.hiring_manager}`,
    created && !Number.isNaN(created.getTime()) ? `Created ${created.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : null].filter(Boolean)
  const counts = selectedJob.candidate_counts
  const addResumes = () => setActiveView('add-candidates')
  async function changeStatus(status: JobLifecycleStatus) {
    if (!selectedJob || status === (selectedJob.status ?? 'active')) return
    setStatusBusy(true); setStatusError('')
    try { await updateJob(selectedJob.id, { status }) }
    catch (error) { setStatusError(error instanceof ApiError && error.detail ? error.detail : 'Could not change the job status. Please retry.') }
    finally { setStatusBusy(false) }
  }
  return <section className="job-workspace">
    <nav className="job-breadcrumb" aria-label="Breadcrumb"><button onClick={() => setActiveView('jobs')}>Jobs</button><span>/</span><span>{selectedJob.title}</span></nav>
    <header className="job-workspace-header">
      <div className="job-workspace-titlebar"><div><div className="job-workspace-title"><h1>{selectedJob.title}</h1><JobStatusBadge job={selectedJob} /></div><p>{metadata.join(' · ')}</p></div>
      {hasRole('recruiter') && <div className="job-workspace-actions">
        {canEdit && <label className="job-status-control"><span className="sr-only">Job status</span><select aria-label="Job status" disabled={statusBusy} value={selectedJob.status ?? 'active'} onChange={event => void changeStatus(event.target.value as JobLifecycleStatus)}>{JOB_STATUSES.map(value => <option key={value} value={value}>{STATUS_LABEL[value]}</option>)}</select></label>}
        <button disabled={!canEdit} title={canEdit ? undefined : 'Bundled demo jobs cannot be edited'} onClick={() => setEditing(true)}><Icon name="edit" />Edit</button>
        <button className="workspace-upload-button" disabled={!open} title={open ? undefined : 'Reopen the job to add candidates'} onClick={addResumes}><Icon name="upload" />Add Resumes</button>
      </div>}</div>
      {statusError && <p role="alert" className="notice error">{statusError}</p>}
      <div className="workspace-metrics" aria-label="Job candidate statistics">{([['group','Total candidates',counts?.total],['person_check','Analyzed',counts?.analyzed],['progress_activity','Processing',counts?.processing]] as const).map(([icon,label,value]) => <div className="workspace-metric" key={label}><span className="workspace-metric-icon"><Icon name={icon} /></span><div><strong aria-label={`${label}: ${value ?? 'unavailable'}`}>{value ?? '—'}</strong><span>{label}</span></div></div>)}</div>
      {!!counts?.failed && <p className="notice" role="status">{counts.failed} candidate{counts.failed === 1 ? '' : 's'} on this job could not be analyzed. Open the candidate to retry.</p>}
      <nav className="workspace-tabs" aria-label="Job workspace">{(['overview','candidates','requirements','comparison','activity'] as const).map(tab => <button key={tab} aria-pressed={tab === jobWorkspaceTab} onClick={() => setJobWorkspaceTab(tab)}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>)}</nav>
    </header>
    {jobWorkspaceTab === 'overview' && <div className="workspace-overview"><article className="workspace-description"><h2>Job description summary</h2><p className="workspace-description-text">{selectedJob.description_raw}</p><h3>Mandatory skills</h3><div className="workspace-skill-list">{mandatory.length ? mandatory.map(requirement => <span className="workspace-skill mandatory" key={requirement.id}>{requirement.requirement_text}</span>) : <p>No mandatory skills specified.</p>}</div><h3>Preferred</h3><div className="workspace-skill-list">{preferred.length ? preferred.map(requirement => <span className="workspace-skill" key={requirement.id}>{requirement.requirement_text}</span>) : <p>No preferred skills specified.</p>}</div></article>
    <aside className="workspace-evidence"><h2><Icon name="description" />Ready to discover evidence?</h2>{open ? <p>Upload resumes to add candidates to this job and evaluate their evidence against it.</p> : <p>This job is {selectedJob.status}. Reopen it to add candidates.</p>}{hasRole('recruiter') && open && <button onClick={addResumes}><Icon name="upload" />Add Resumes</button>}<small>PDF, DOCX or TXT · Single or batch · Up to 5 MB per resume</small></aside></div>}
    {jobWorkspaceTab === 'candidates' && <CandidateResultsView key={selectedJob.id} />}
    {jobWorkspaceTab === 'requirements' && <article className="workspace-description"><h2>Role requirements</h2><p>Candidates are scored against exactly these requirements.</p>{selectedJob.requirements?.length ? <ul className="workspace-requirement-list">{selectedJob.requirements.map(requirement => <li key={requirement.id}><span>{requirement.requirement_text}</span><span className={'workspace-skill ' + (requirement.is_mandatory ? 'mandatory' : '')}>{requirement.is_mandatory ? 'Mandatory' : 'Preferred'}</span></li>)}</ul> : <p>No structured requirements available.</p>}{canEdit && <button onClick={() => setEditing(true)}>Edit requirements</button>}</article>}
    {jobWorkspaceTab === 'comparison' && <CandidateComparisonView />}
    {jobWorkspaceTab === 'activity' && <JobActivity jobId={selectedJob.id} onOpenCandidate={openCandidateDetail} />}
    {editing && <JobEditDialog job={selectedJob} onClose={() => setEditing(false)} />}
  </section>
}
