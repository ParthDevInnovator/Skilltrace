import type { RankedCandidate } from '@/types/matching'
import { useCandidateContext } from '@/hooks/useCandidateContext'
import { EvidenceBar } from '@/components/evidence/EvidenceBar'
import { provenanceSummary } from '@/types/context'
import type { CandidateSummary } from '@/types'
import { useJob } from '@/context/JobContext'

interface CandidateCardProps {
  ranking?: RankedCandidate
  candidate: CandidateSummary
}

export function CandidateCard({ candidate, ranking }: CandidateCardProps) {
  const { openCandidateDetail } = useJob()

  const initials = candidate.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const { context } = useCandidateContext(candidate.id)
  const evidenceLabel = context?.evidence_label ?? 'Evidence pending'

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm hover:border-[#6554c0] hover:shadow-md transition-all flex flex-col justify-between gap-4">
      <div className="flex flex-col gap-3">
        {/* Top: Avatar, Name, and Fit Badge */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-lg bg-[#ebedf9] text-[#4d3aa6] flex items-center justify-center font-bold text-sm border border-[#c9c4d4] flex-shrink-0">
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-sm text-[#181c23] truncate">
                {candidate.full_name}
              </span>
              <span className="text-xs text-[#65646f] truncate">{candidate.headline}</span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="text-xs font-bold text-[#4d3aa6] bg-[#f1eefc] px-2 py-0.5 rounded font-mono">
              {ranking ? ranking.context_status === 'building' ? 'Context building' : ranking.context_status === 'failed' ? 'Context failed' : `Final ${Math.round(ranking.final_score*100)}%` : 'Unassessed'}
            </span>
            <span className="badge-status badge-evidence-none">
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-75"></span>
              <span>{evidenceLabel}</span>
            </span>
          </div>
        </div>

        {/* Location & ID meta */}
        <div className="flex items-center gap-2 text-xs text-[#656170]">
          <span aria-hidden="true" className="material-symbols-outlined text-[15px] text-[#656170]">
            location_on
          </span>
          <span className="truncate">{candidate.location}</span>
          <span>•</span>
          <span className="font-mono text-[11px] text-[#65646f]">#{candidate.id}</span>
        </div>

        {/* Skill Pills */}
        <div className="flex flex-wrap gap-1.5">
          {candidate.top_skills.slice(0, 4).map((skill) => (
            <span key={skill} className="skill-tag">
              {skill}
            </span>
          ))}
          {candidate.top_skills.length > 4 && (
            <span className="skill-tag text-[#656170]">
              +{candidate.top_skills.length - 4} more
            </span>
          )}
        </div>
      </div>

      {ranking?.context_status === 'ready' && <p className="match-scores" data-testid="match-score">Resume Fit {Math.round(ranking.resume_fit*100)}% | Evidence {Math.round(ranking.evidence_strength*100)}% | Final {Math.round(ranking.final_score*100)}%</p>}
      {context && <><EvidenceBar score={context.evidence_score} label={context.evidence_label} showLabel={false} /><p className="provenance-label">{provenanceSummary(context.evidence_records)}</p></>}
      {/* Footer Action */}
      <div className="border-t border-[#ebedf9] pt-3 flex items-center justify-between">
        <span className="text-[11px] text-[#656170] flex items-center gap-1">
          <span aria-hidden="true" className="material-symbols-outlined text-[14px] text-[#247a52]">
            person_outline
          </span>
          <span>Candidate Profile</span>
        </span>
        <button
          type="button"
          onClick={() => openCandidateDetail(candidate.id)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-[#f1f3fe] text-[#4d3aa6] hover:bg-[#6554c0] hover:text-white transition-colors"
        >
          <span>View Profile</span>
          <span aria-hidden="true" className="material-symbols-outlined text-[14px]">arrow_forward</span>
        </button>
      </div>
    </div>
  )
}
