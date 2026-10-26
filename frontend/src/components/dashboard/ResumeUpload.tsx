import { useState } from 'react'
import { api } from '@/services/api'
import { useJob } from '@/context/JobContext'
export function ResumeUpload() {
  const { openCandidateDetail } = useJob()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <details className="panel"><summary>Upload candidate resume</summary><p>PDF, DOCX or TXT, up to 5 MB. Candidate data lasts for this server session. Provide corrections if identity extraction misses fields.</p><form className="page-stack" onSubmit={async event => {
    event.preventDefault()
    if (!file || !/\.(pdf|docx|txt)$/i.test(file.name) || file.size === 0 || file.size > 5 * 1024 * 1024) { setError('Choose a non-empty PDF, DOCX or TXT file up to 5 MB.'); return }
    const data = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try { const result = await api.uploadResume(data); openCandidateDetail(result.candidate_id) }
    catch { setError('Upload could not be processed. Check the file and provide a valid name/email if they are missing from the resume.') }
    finally { setBusy(false) }
  }}><div><label htmlFor="candidate-resume">Resume file</label><input id="candidate-resume" name="file" type="file" accept=".pdf,.docx,.txt" onChange={event => setFile(event.target.files?.[0] ?? null)} disabled={busy} /></div><div className="form-grid"><div><label htmlFor="upload-name">Full name correction</label><input id="upload-name" name="full_name" maxLength={150} /></div><div><label htmlFor="upload-email">Email correction</label><input id="upload-email" name="email" type="email" maxLength={254} /></div><div><label htmlFor="upload-location">Location correction</label><input id="upload-location" name="location" maxLength={300} /></div></div>{error && <p role="alert" className="notice error">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Uploading resume...' : 'Upload and inspect candidate'}</button></form></details>
}
