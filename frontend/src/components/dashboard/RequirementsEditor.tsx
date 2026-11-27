import { useState } from 'react'
import { draftKey, type RequirementDraft } from '@/services/requirementDrafts'

/**
 * The exact list of requirements that will be scored (OI-45): recruiters see, edit and confirm it
 * before saving, so nothing is extracted or dropped behind their back.
 */
export function RequirementsEditor({ value, onChange, idPrefix = 'req' }: { value: RequirementDraft[]; onChange: (next: RequirementDraft[]) => void; idPrefix?: string }) {
  const [text, setText] = useState('')
  const [mandatory, setMandatory] = useState(true)
  const duplicate = !!text.trim() && value.some(draft => draft.requirement_text.trim().toLowerCase() === text.trim().toLowerCase())
  function add() {
    if (!text.trim() || duplicate) return
    onChange([...value, { key: draftKey(), requirement_text: text.trim(), is_mandatory: mandatory }])
    setText('')
  }
  const update = (key: string, patch: Partial<RequirementDraft>) => onChange(value.map(draft => draft.key === key ? { ...draft, ...patch } : draft))
  return <div className="requirements-editor">
    {value.length ? <ol className="requirements-editor-list">{value.map((draft, index) => <li key={draft.key}>
      <label className="sr-only" htmlFor={`${idPrefix}-text-${draft.key}`}>Requirement {index + 1}</label>
      <input id={`${idPrefix}-text-${draft.key}`} value={draft.requirement_text} maxLength={500} onChange={event => update(draft.key, { requirement_text: event.target.value })} />
      <select aria-label={`Requirement ${index + 1} priority`} value={draft.is_mandatory ? 'mandatory' : 'preferred'} onChange={event => update(draft.key, { is_mandatory: event.target.value === 'mandatory' })}>
        <option value="mandatory">Mandatory</option><option value="preferred">Preferred</option>
      </select>
      <button type="button" aria-label={`Remove requirement ${draft.requirement_text || index + 1}`} onClick={() => onChange(value.filter(item => item.key !== draft.key))}>Remove</button>
    </li>)}</ol> : <p role="status">No requirements yet. Add at least one requirement to score candidates against.</p>}
    <div className="requirements-editor-add">
      <label htmlFor={`${idPrefix}-new`}>Add requirement</label>
      <input id={`${idPrefix}-new`} value={text} maxLength={500} placeholder="e.g. 3+ years of Python" onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add() } }} />
      <select aria-label="New requirement priority" value={mandatory ? 'mandatory' : 'preferred'} onChange={event => setMandatory(event.target.value === 'mandatory')}>
        <option value="mandatory">Mandatory</option><option value="preferred">Preferred</option>
      </select>
      <button type="button" disabled={!text.trim() || duplicate} onClick={add}>Add</button>
      {duplicate && <small role="status">This requirement is already in the list.</small>}
    </div>
  </div>
}
