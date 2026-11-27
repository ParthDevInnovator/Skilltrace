import { useEffect, useRef, useState } from 'react'
import { useJob } from '@/context/JobContext'
import { ApiError } from '@/services/api'
import type { Job, JobUpdateRequest } from '@/types'
import { RequirementsEditor } from './RequirementsEditor'
import { draftKey, toRequestRequirements, type RequirementDraft } from '@/services/requirementDrafts'

const TEXT_FIELDS = ['title', 'department', 'location', 'employment_type', 'experience_range', 'hiring_manager', 'description_raw'] as const
type TextField = typeof TEXT_FIELDS[number]
const LABELS: Record<TextField, string> = {
  title: 'Job title', department: 'Department', location: 'Location', employment_type: 'Employment type',
  experience_range: 'Experience range', hiring_manager: 'Hiring manager', description_raw: 'Job description',
}

/** Edit an existing custom job (OI-31). Requirements saved here are exactly the ones scored. */
export function JobEditDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const { updateJob } = useJob()
  const [fields, setFields] = useState<Record<TextField, string>>(() => Object.fromEntries(TEXT_FIELDS.map(name => [name, job[name] ?? ''])) as Record<TextField, string>)
  const [original] = useState<RequirementDraft[]>(() => (job.requirements ?? []).map(r => ({ key: draftKey(), id: r.id, requirement_text: r.requirement_text, is_mandatory: r.is_mandatory })))
  const [drafts, setDrafts] = useState<RequirementDraft[]>(original)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLInputElement>('#edit-title')?.focus()
    return () => previous?.focus()
  }, [])

  function patch(): JobUpdateRequest {
    const result: JobUpdateRequest = {}
    for (const name of TEXT_FIELDS) {
      const value = fields[name].trim()
      if (value !== (job[name] ?? '').trim()) (result as Record<string, string | null>)[name] = value || (['employment_type', 'experience_range', 'hiring_manager'].includes(name) ? null : value)
    }
    const next = toRequestRequirements(drafts)
    const before = toRequestRequirements(original)
    const same = next.length === before.length && next.every((r, i) => r.requirement_text === before[i].requirement_text && r.is_mandatory === before[i].is_mandatory)
    if (!same) result.requirements = next
    return result
  }
  async function save() {
    for (const name of ['title', 'department', 'location'] as const) {
      if (fields[name].trim().length < 2) { setError(`${LABELS[name]} needs at least 2 characters.`); return }
    }
    if (fields.description_raw.trim().length < 10) { setError('Job description needs at least 10 characters.'); return }
    if (!toRequestRequirements(drafts).length) { setError('Keep at least one requirement to score candidates against.'); return }
    const changes = patch()
    if (!Object.keys(changes).length) { onClose(); return }
    setBusy(true); setError('')
    try { await updateJob(job.id, changes); onClose() }
    catch (e) { setError(e instanceof ApiError && e.detail ? e.detail : 'Could not save the job. Please retry.') }
    finally { setBusy(false) }
  }
  return <div className="modal-backdrop"><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="edit-job-heading" className="modal-panel job-edit-dialog"
    onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose() } }}>
    <h2 id="edit-job-heading">Edit job</h2>
    <div className="form-grid">{TEXT_FIELDS.filter(name => name !== 'description_raw').map(name => <div key={name}>
      <label htmlFor={`edit-${name.replace('_raw', '').replaceAll('_', '-')}`}>{LABELS[name]}</label>
      <input id={`edit-${name.replace('_raw', '').replaceAll('_', '-')}`} value={fields[name]} maxLength={name === 'hiring_manager' ? 255 : name === 'title' ? 150 : 100}
        onChange={event => setFields(previous => ({ ...previous, [name]: event.target.value }))} />
    </div>)}</div>
    <label htmlFor="edit-description">Job description</label>
    <textarea id="edit-description" rows={6} maxLength={100000} value={fields.description_raw} onChange={event => setFields(previous => ({ ...previous, description_raw: event.target.value }))} />
    <h3>Requirements that will be scored</h3>
    <p className="creation-subtitle">Changing the description does not change these. Edit the list to change how candidates are scored.</p>
    <RequirementsEditor value={drafts} onChange={setDrafts} idPrefix="edit-req" />
    {error && <p role="alert" className="notice error">{error}</p>}
    <footer className="creation-actions"><button disabled={busy} onClick={onClose}>Cancel</button><button className="creation-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save changes'}</button></footer>
  </div></div>
}
