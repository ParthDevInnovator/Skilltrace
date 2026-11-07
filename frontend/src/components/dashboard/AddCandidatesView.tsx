import { useState } from 'react'
import { ResumeUpload } from './ResumeUpload'
import { useJob } from '@/context/JobContext'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/services/api'
export function AddCandidatesView() {
  const { selectedJob, setActiveView } = useJob()
  const { hasRole } = useAuth()
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const [files, setFiles] = useState<File[]>([])
  const [results, setResults] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  function add(incoming: FileList | null) {
    if (!incoming) return
    setFiles(current => [...current, ...Array.from(incoming).filter(file => !current.some(item => item.name === file.name))])
  }
  async function uploadBatch() {
    setBusy(true)
    for (const file of files) {
      if (results[file.name] === 'Complete') continue
      if (!/\.(pdf|docx|txt)$/i.test(file.name) || !file.size || file.size > 5 * 1024 * 1024) { setResults(current => ({...current, [file.name]: 'Choose a PDF, DOCX or TXT up to 5 MB'})); continue }
      setResults(current => ({...current, [file.name]: 'Processing…'}))
      const data = new FormData(); data.append('file', file)
      try { await api.uploadResume(data); setResults(current => ({...current, [file.name]: 'Complete'})) }
      catch { setResults(current => ({...current, [file.name]: 'Upload failed — retry'})) }
    }
    setBusy(false)
  }
  return <section className="candidate-creation"><header className="resume-intake-header"><button className="resume-intake-brand" aria-label="Back to job" onClick={() => setActiveView('job-detail')}><b>S</b><span>skitrace</span></button><span className="resume-intake-crumb">{selectedJob?.title || 'Job'} - Add Candidates</span><span className="resume-intake-saved">Requirements saved</span></header><div className="resume-intake-content"><h1>Add Candidates</h1><p className="creation-subtitle">Upload resumes to discover the evidence behind each candidate.</p>{hasRole('recruiter') ? <><div className="upload-mode">{(['single','batch'] as const).map(value => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{value === 'single' ? 'Single Resume' : 'Batch Upload'}</button>)}</div><div className="candidate-upload-columns"><section className={'creation-card ' + (mode === 'single' ? 'selected-upload' : '')}><h3><span className="material-symbols-outlined" aria-hidden="true">description</span>Single Resume</h3><ResumeUpload pipeline /></section><section className={'creation-card ' + (mode === 'batch' ? 'selected-upload' : '')}><h3><span className="material-symbols-outlined" aria-hidden="true">stacks</span>Batch Upload · {files.length} files queued</h3><div className="creation-drop batch-resume-drop" onDragOver={event => event.preventDefault()} onDrop={event => {event.preventDefault(); if(!busy) add(event.dataTransfer.files)}}><label className="creation-browse" htmlFor="batch-resumes"><span className="material-symbols-outlined" aria-hidden="true">upload</span>Drop multiple resumes here</label><input className="file-hidden" id="batch-resumes" type="file" multiple accept=".pdf,.docx,.txt" disabled={busy} onChange={event => add(event.target.files)} /></div><ul className="batch-files">{files.map(file => <li key={file.name}><div><span>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</span><button disabled={busy} aria-label={`Remove ${file.name}`} onClick={() => setFiles(current => current.filter(item => item !== file))}>×</button></div><small role="status">{results[file.name] || 'Ready to upload'}</small><div className="upload-track"><span style={{width: results[file.name] === 'Complete' ? '100%' : '0%'}} /></div></li>)}</ul><button className="batch-start" disabled={busy || !files.length} onClick={() => void uploadBatch()}>{busy ? 'Analyzing resumes…' : `Start Batch Analysis (${files.length})`}</button>{files.length > 0 && files.every(file => results[file.name] === 'Complete') && <button onClick={() => setActiveView('talent-pool')}>View candidates</button>}</section></div></> : <p role="alert">Your role cannot upload candidate resumes.</p>}</div></section>
}
