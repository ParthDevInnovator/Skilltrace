import { describe, expect, it } from 'vitest'
import { displayEvidenceLabel, provenanceSummary, type EvidenceRecord } from '@/types/context'

// OI-19: an unreachable source must never read as "no public evidence".
const record = { provenance: 'live' } as EvidenceRecord

describe('source outages', () => {
  it('reports unreachable sources instead of an evidence gap', () => {
    expect(provenanceSummary([], ['github', 'leetcode'])).toBe('GitHub, LeetCode could not be reached - retry later')
    expect(displayEvidenceLabel({ evidence_label: 'No public evidence', unavailable_sources: ['github'] })).toBe('Sources unavailable')
  })

  it('keeps partial evidence and still names the outage', () => {
    expect(provenanceSummary([record], ['leetcode'])).toBe(
      'Evidence from external signals - claims remain separately assessed. LeetCode could not be reached - retry later')
    expect(displayEvidenceLabel({ evidence_label: 'Some', unavailable_sources: ['leetcode'] })).toBe('Some')
  })

  it('shows a real evidence gap only when every source was read', () => {
    expect(provenanceSummary([], [])).toBe('No public evidence available')
    expect(displayEvidenceLabel({ evidence_label: 'No public evidence', unavailable_sources: [] })).toBe('No public evidence')
    expect(displayEvidenceLabel({ evidence_label: 'No public evidence' })).toBe('No public evidence')
  })
})
