import { useState } from 'react'
import { api } from '@/services/api'
import type { CandidateContext, ClaimEvidenceLink, ClaimReviewDecision, ResumeClaim } from '@/types/context'

const LINK_LABELS: Record<ClaimEvidenceLink, string> = {
  supported_by_evidence: 'Supported by evidence',
  possible_contradiction: 'Possible contradiction',
  no_evidence: 'No public evidence',
}

const LINK_STYLES: Record<ClaimEvidenceLink, string> = {
  supported_by_evidence: 'bg-[#eef6ee] border-[#cfe3cf] text-[#2f6b35]',
  possible_contradiction: 'bg-[#fbf0e4] border-[#efd3b0] text-[#8a5a12]',
  no_evidence: 'bg-white border-[#e7e2d9] text-[#59616b]',
}

export function reviewLabel(claim: ResumeClaim): string | null {
  const review = claim.review
  if (!review) return null
  const when = new Date(review.reviewed_at).toLocaleDateString()
  if (review.decision === 'dismissed') return `Dismissed by ${review.reviewed_by} · ${when}`
  return review.reviewed_link === 'possible_contradiction'
    ? `Contradiction confirmed by ${review.reviewed_by} · ${when}`
    : `Confirmed by ${review.reviewed_by} · ${when}`
}

/** One reported claim, its automatic evidence link and the recruiter's confirm/dismiss decision (OI-29). */
export function ClaimReviewCard({ claim, context, canReview, onUpdated }: {
  claim: ResumeClaim
  context: CandidateContext
  canReview: boolean
  onUpdated: (claim: ResumeClaim) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const link = claim.evidence_link ?? null
  const reviewable = link === 'supported_by_evidence' || link === 'possible_contradiction'
  const observations = (ids: string[] | undefined) => (ids ?? []).map(id => {
    const record = context.evidence_records.find(item => item.id === id)
    if (record) return { id, text: record.observation, url: /^https?:\/\//i.test(record.source_url) ? record.source_url : null }
    const feedback = context.interview_feedback.find(item => item.id === id)
    return { id, text: feedback ? `Interview feedback: ${feedback.feedback}` : id, url: null }
  })
  const supporting = observations(claim.supporting_evidence_ids)
  const conflicting = observations(claim.conflicting_evidence_ids)

  const act = async (decision: ClaimReviewDecision | null) => {
    setBusy(true)
    setError(null)
    try {
      onUpdated(decision ? await api.reviewClaim(claim.candidate_id, claim.id, decision) : await api.clearClaimReview(claim.candidate_id, claim.id))
    } catch {
      setError('The review could not be saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const reviewed = reviewLabel(claim)
  const confirmText = link === 'possible_contradiction' ? 'Confirm contradiction' : 'Confirm link'
  return (
    <article className="p-4 rounded-xl bg-[#f8f7f4] border border-[#e7e2d9]" aria-label={`Claim: ${claim.claim_text}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <strong className="text-xs font-bold text-[#141618]">
          {claim.section}{claim.skill ? ` - ${claim.skill}` : ''}
        </strong>
        <span className={`text-[11px] px-2 py-0.5 rounded border ${link ? LINK_STYLES[link] : 'bg-white border-[#e7e2d9] text-[#59616b]'}`}>
          {link ? LINK_LABELS[link] : 'Not assessed'}
        </span>
      </div>
      <p className="text-xs text-[#141618] mb-1">{claim.claim_text}</p>
      {claim.assessment_reason && <p className="text-[11px] text-[#59616b] mb-1">{claim.assessment_reason}</p>}
      {[{ title: 'May conflict', items: conflicting }, { title: 'Linked evidence', items: supporting }].filter(group => group.items.length).map(group => (
        <div key={group.title} className="mt-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#59616b]">{group.title}</span>
          <ul className="list-disc pl-4">
            {group.items.map(item => <li key={item.id} className="text-[11px] text-[#141618]">
              {item.text}{item.url && <> {' '}<a href={item.url} target="_blank" rel="noreferrer" className="underline">source</a></>}
            </li>)}
          </ul>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {reviewed && <span className="text-[11px] text-[#141618]">{reviewed}</span>}
        {canReview && reviewable && !claim.review && <>
          <button type="button" disabled={busy} onClick={() => { void act('confirmed') }}
            className="h-7 px-3 rounded-lg bg-[#141618] text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50">{confirmText}</button>
          <button type="button" disabled={busy} onClick={() => { void act('dismissed') }}
            className="h-7 px-3 rounded-lg border border-[#e7e2d9] bg-white text-[11px] font-semibold cursor-pointer disabled:opacity-50">Dismiss</button>
        </>}
        {canReview && claim.review && <button type="button" disabled={busy} onClick={() => { void act(null) }}
          className="h-7 px-3 rounded-lg border border-[#e7e2d9] bg-white text-[11px] font-semibold cursor-pointer disabled:opacity-50">Undo review</button>}
        {!claim.review && reviewable && <span className="text-[10px] text-[#59616b]">Unverified until a recruiter confirms it.</span>}
      </div>
      {error && <p role="alert" className="text-[11px] text-[#9b2c2c] mt-1">{error}</p>}
      <small className="text-[10px] text-[#59616b]">{claim.provenance}</small>
    </article>
  )
}
