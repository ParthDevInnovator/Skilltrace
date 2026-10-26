import { useId, useState } from 'react'
import type { EvidenceRecord } from '@/types/context'
export function EvidenceCard({ record, expanded = false }: { record: EvidenceRecord; expanded?: boolean }) {
  const [open, setOpen] = useState(expanded)
  const id = useId()
  const url = /^https?:\/\//i.test(record.source_url) ? record.source_url : null
  return <article className="evidence-card"><button className="evidence-card-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
    <span><strong><span aria-hidden="true" className="material-symbols-outlined">{record.source_type === 'github' ? 'code' : record.source_type === 'leetcode' ? 'terminal' : record.source_type === 'linkedin' ? 'badge' : 'description'}</span> {record.source_type} - {record.skill}</strong><span className="observation-preview">{record.observation}</span></span><span>{record.computed_weight.toFixed(1)} points - {record.observation_date ?? 'Undated'} {open ? '-' : '+'}</span>
  </button><p className="provenance-label">{record.provenance}</p>
    <div id={id} hidden={!open} className="evidence-card-body"><p>{record.observation}</p>{url && <a href={url} target="_blank" rel="noreferrer">Inspect source</a>}<p>Observed: {record.observation_date ?? 'Undated'} - Reference date: {record.reference_date}</p><p>Weight: {record.base_weight} x {record.recency_multiplier} = {record.computed_weight.toFixed(1)}</p><p>Provenance: {record.provenance}</p></div>
  </article>
}
