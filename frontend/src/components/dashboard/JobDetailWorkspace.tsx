import { useJob } from '@/context/JobContext'
import { useAuth } from '@/context/AuthContext'
import { CandidateResultsView } from './CandidateResultsView'
import { CandidateComparisonView } from './CandidateComparisonView'

function Icon({ name }: { name: string }) {
  return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>
}

export function JobDetailWorkspace() {
  const { selectedJob, setActiveView, jobWorkspaceTab, setJobWorkspaceTab } = useJob()
  const { hasRole } = useAuth()
  if (!selectedJob) return <section className="panel"><h1>Select a job</h1><button onClick={() => setActiveView('jobs')}>Browse jobs</button></section>
  const employment = selectedJob.description_raw.match(/Employment type:\s*([^\n]+)/i)?.[1]
  const mandatory = selectedJob.requirements?.filter(requirement => requirement.is_mandatory) ?? []
  const preferred = selectedJob.requirements?.filter(requirement => !requirement.is_mandatory) ?? []
  const created = selectedJob.created_at ? new Date(selectedJob.created_at) : null
  const metadata = [selectedJob.department, selectedJob.location, employment, created && !Number.isNaN(created.getTime()) ? `Created ${created.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : null].filter(Boolean)
  const addResumes = () => setActiveView('add-candidates')
  return <section className="job-workspace">
    <nav className="job-breadcrumb" aria-label="Breadcrumb"><button onClick={() => setActiveView('jobs')}>Jobs</button><span>/</span><span>{selectedJob.title}</span></nav>
    <header className="job-workspace-header">
      <div className="job-workspace-titlebar"><div><div className="job-workspace-title"><h1>{selectedJob.title}</h1><span className="workspace-status" title="Job lifecycle status is not provided by the API">Status unavailable</span></div><p>{metadata.join(' · ')}</p></div>
      {hasRole('recruiter') && <div className="job-workspace-actions"><button disabled title="Editing existing jobs is not supported by the API yet"><Icon name="edit" />Edit</button><button className="workspace-upload-button" onClick={addResumes}><Icon name="upload" />Add Resumes</button></div>}</div>
      <div className="workspace-metrics" aria-label="Job candidate statistics">{[['group','Total candidates'],['person_check','Analyzed'],['progress_activity','Processing']].map(([icon,label]) => <div className="workspace-metric" key={label}><span className="workspace-metric-icon"><Icon name={icon} /></span><div><strong aria-label={`${label}: unavailable`}>—</strong><span>{label}</span></div></div>)}</div>
      <nav className="workspace-tabs" aria-label="Job workspace">{(['overview','candidates','requirements','comparison','activity'] as const).map(tab => <button key={tab} aria-pressed={tab === jobWorkspaceTab} onClick={() => setJobWorkspaceTab(tab)}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>)}</nav>
    </header>
    {jobWorkspaceTab === 'overview' && <div className="workspace-overview"><article className="workspace-description"><h2>Job description summary</h2><p className="workspace-description-text">{selectedJob.description_raw}</p><h3>Mandatory skills</h3><div className="workspace-skill-list">{mandatory.length ? mandatory.map(requirement => <span className="workspace-skill mandatory" key={requirement.id}>{requirement.requirement_text}</span>) : <p>No mandatory skills specified.</p>}</div><h3>Preferred</h3><div className="workspace-skill-list">{preferred.length ? preferred.map(requirement => <span className="workspace-skill" key={requirement.id}>{requirement.requirement_text}</span>) : <p>No preferred skills specified.</p>}</div></article>
    <aside className="workspace-evidence"><h2><Icon name="description" />Ready to discover evidence?</h2><p>Upload resumes to discover the evidence behind each candidate and evaluate it against this role.</p>{hasRole('recruiter') && <button onClick={addResumes}><Icon name="upload" />Add Resumes</button>}<small>PDF, DOCX or TXT · Single or batch · Up to 5 MB per resume</small></aside></div>}
    {jobWorkspaceTab === 'candidates' && <CandidateResultsView key={selectedJob.id} />}
    {jobWorkspaceTab === 'requirements' && <article className="workspace-description"><h2>Role requirements</h2>{selectedJob.requirements?.length ? <ul className="workspace-requirement-list">{selectedJob.requirements.map(requirement => <li key={requirement.id}><span>{requirement.requirement_text}</span><span className={'workspace-skill ' + (requirement.is_mandatory ? 'mandatory' : '')}>{requirement.is_mandatory ? 'Mandatory' : 'Preferred'}</span></li>)}</ul> : <p>No structured requirements available.</p>}</article>}
    {jobWorkspaceTab === 'comparison' && <CandidateComparisonView />}
    {jobWorkspaceTab === 'activity' && <p className="workspace-description">Job activity history is not available in this workspace.</p>}
  </section>
}
