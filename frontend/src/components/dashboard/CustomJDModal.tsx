import { useEffect, useRef, useState } from 'react'
import { useJob } from '@/context/JobContext'
import { extractDocumentText } from '@/services/documentText'
export function CustomJDModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { createCustomJob } = useJob()
  const [tab, setTab] = useState<'paste' | 'upload'>('paste')
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState('Engineering')
  const [location, setLocation] = useState('Remote')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)
  const requestId = useRef(0)
  useEffect(() => {
    if (!isOpen) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.querySelector<HTMLInputElement>('#jd-title')?.focus()
    // The counter intentionally invalidates any in-flight read when this dialog unmounts.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    return () => { requestId.current++; document.body.style.overflow = overflow; previous?.focus() }
  }, [isOpen])
  if (!isOpen) return null
  const readFile = async (file?: File) => {
    if (!file) return
    const id = ++requestId.current
    setReading(true); setError(''); setFileName('')
    try {
      const value = await extractDocumentText(file)
      if (id !== requestId.current) return
      setText(value); setFileName(file.name)
      setTitle(previous => previous || file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '))
    } catch (err) {
      if (id === requestId.current) setError(err instanceof Error && /Use a|empty|5 MB|No readable|too long/.test(err.message) ? err.message : 'Could not read this document. Check the file or paste the text instead.')
    } finally { if (id === requestId.current) setReading(false) }
  }
  return <div className="modal-backdrop"><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="jd-heading" aria-describedby="jd-help" className="jd-dialog" onKeyDown={e => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'Tab') {
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || [])
      const first = controls[0], last = controls[controls.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
  }}>
    <div className="page-title"><h2 id="jd-heading">Add Custom Job Description</h2><button aria-label="Close job description dialog" onClick={onClose}>Close</button></div>
    <p id="jd-help">Create a requisition for this session. Refreshing the page clears custom jobs.</p>
    <form noValidate onSubmit={e => {
      e.preventDefault()
      if (reading) return
      if (!title.trim()) { setError('Please provide a job title.'); dialog.current?.querySelector<HTMLInputElement>('#jd-title')?.focus(); return }
      if (text.trim().length < 50) { setError('Job description must be at least 50 characters long.'); dialog.current?.querySelector<HTMLTextAreaElement>('#jd-text')?.focus(); return }
      createCustomJob(title.trim(), text.trim(), department.trim() || 'Custom Requisition', location.trim() || 'Remote'); onClose()
    }} className="page-stack">
      <div className="modal-actions"><button type="button" aria-pressed={tab === 'paste'} onClick={() => setTab('paste')}>Paste Text</button><button type="button" aria-pressed={tab === 'upload'} onClick={() => setTab('upload')}>Upload Document</button><button type="button" disabled={reading} onClick={() => { setTitle('Senior Platform Engineer'); setText('Build reliable distributed systems with Python, FastAPI, PostgreSQL and Kubernetes. Collaborate with product teams and maintain tested production services.'); setError(''); setFileName('') }}>Load Sample JD</button></div>
      <div className="form-grid"><div><label htmlFor="jd-title">Job Title *</label><input id="jd-title" value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} /></div><div><label htmlFor="jd-department">Department</label><input id="jd-department" value={department} onChange={e => setDepartment(e.target.value)} maxLength={200} /></div><div><label htmlFor="jd-location">Location</label><input id="jd-location" value={location} onChange={e => setLocation(e.target.value)} maxLength={200} /></div></div>
      {tab === 'upload' && <div className="drop-zone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length > 1) setError('Choose one document at a time.'); else void readFile(e.dataTransfer.files[0]) }}>
        <label htmlFor="jd-file">Drop a job description here or browse files</label><input id="jd-file" type="file" accept=".txt,.md,.pdf,.docx" disabled={reading} onChange={e => { void readFile(e.target.files?.[0]); e.target.value = '' }} /><small>TXT, MD, PDF or DOCX - Up to 5 MB - Scanned PDFs require pasted text</small>
        <p role="status">{reading ? 'Reading document...' : fileName ? `Loaded: ${fileName}` : ''}</p>
      </div>}
      <div><label htmlFor="jd-text">Job Description Text *</label><textarea id="jd-text" rows={8} value={text} maxLength={100000} disabled={reading} onChange={e => setText(e.target.value)} required aria-describedby="jd-count" /><small id="jd-count">{text.trim() ? text.trim().split(/\s+/).length : 0} words ({text.length} characters)</small></div>
      {error && <p role="alert" className="notice error">{error}</p>}
      <div className="modal-actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={reading}>Set as Active Requisition</button></div>
    </form>
  </div></div>
}
