import { useRef, useState } from 'react'
import { api } from '@/services/api'
import { useJob } from '@/context/JobContext'
export function ResumeUpload({ pipeline = false }: { pipeline?: boolean }) {
  const { openCandidateDetail, startPipeline } = useJob()
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <details className="panel resume-upload-panel" open={pipeline || undefined}><summary>Upload candidate resume</summary><form className="page-stack" onSubmit={async event => {
    event.preventDefault()
    if (!file || !/\.(pdf|docx|txt)$/i.test(file.name) || file.size === 0 || file.size > 5 * 1024 * 1024) { setError('Choose a non-empty PDF, DOCX or TXT file up to 5 MB.'); return }
    const data = new FormData(event.currentTarget)
    data.set('file', file)
    setBusy(true); setError('')
    try { const result = await api.uploadResume(data); if (pipeline) startPipeline(result.candidate_id); else openCandidateDetail(result.candidate_id) }
    catch { setError('Upload could not be processed. Check the file and provide a valid name/email if they are missing from the resume.') }
    finally { setBusy(false) }
  }}><div className="creation-drop single-resume-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy && event.dataTransfer.files.length) { setFile(event.dataTransfer.files[0]); setError('') } }}><span className="material-symbols-outlined resume-drop-icon" aria-hidden="true">upload_file</span><p>Drag and drop resume PDF</p><button type="button" className="resume-browse-button" disabled={busy} onClick={() => fileInput.current?.click()}>Browse Files</button><input className="file-hidden" ref={fileInput} id="candidate-resume" aria-label="Resume file" name="file" type="file" accept=".pdf,.docx,.txt" onChange={event => {setFile(event.target.files?.[0] ?? null);setError('')}} disabled={busy} /></div>{file && <div className="resume-file-row"><span className="material-symbols-outlined resume-file-icon" aria-hidden="true">description</span><div className="resume-file-info"><span>{file.name}</span><small>{(file.size / 1024 / 1024).toFixed(1)} MB - {busy ? 'Uploading...' : 'Ready for analysis'}</small><div className={'upload-track ' + (busy ? 'upload-pending' : '')}><span /></div></div><button type="button" className="remove-resume" aria-label={`Remove ${file.name}`} disabled={busy} onClick={() => {setFile(null);if(fileInput.current) fileInput.current.value = '';setError('')}}>×</button></div>}<details className="resume-corrections"><summary>Correct candidate details (optional)</summary><div className="form-grid"><div><label htmlFor="upload-name">Full name correction</label><input id="upload-name" name="full_name" maxLength={150} /></div><div><label htmlFor="upload-email">Email correction</label><input id="upload-email" name="email" type="email" maxLength={254} /></div><div><label htmlFor="upload-location">Location correction</label><input id="upload-location" name="location" maxLength={300} /></div></div></details>{error && <p role="alert" className="notice error">{error}</p>}<button className="primary-button resume-start" disabled={busy || !file}>{pipeline && <span className="material-symbols-outlined" aria-hidden="true">auto_awesome</span>}{busy ? 'Uploading resume...' : pipeline ? 'Start Analysis' : 'Upload and inspect candidate'}</button></form></details>
}
