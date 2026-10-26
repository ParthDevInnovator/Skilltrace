import { useSyncExternalStore } from 'react'
import type { EvidenceLabel } from '@/types'
import { EVIDENCE_LABELS } from '@/types/context'
const query = '(prefers-reduced-motion: reduce)'
function subscribe(callback: () => void) {
  const media = window.matchMedia?.(query)
  media?.addEventListener('change', callback)
  return () => media?.removeEventListener('change', callback)
}
export function EvidenceBar({ score, label, showLabel = true }: { score: number; label: EvidenceLabel; showLabel?: boolean }) {
  const reducedMotion = useSyncExternalStore(subscribe, () => window.matchMedia?.(query).matches ?? false, () => false)
  const tier = EVIDENCE_LABELS.indexOf(label)
  return <div className="evidence-bar-wrap"><div role="meter" aria-label={`Evidence strength: ${label}`} aria-valuemin={0} aria-valuemax={Math.max(10, score)} aria-valuenow={score} aria-valuetext={`${score} points, ${label}`} className={`evidence-bar ${reducedMotion ? '' : 'evidence-animate'}`}>
    {EVIDENCE_LABELS.map((name, index) => <span key={name} data-active={index <= tier} data-tier={index} />)}
  </div>{showLabel && <span className="evidence-caption">{label} - {score.toFixed(1)} points</span>}</div>
}
