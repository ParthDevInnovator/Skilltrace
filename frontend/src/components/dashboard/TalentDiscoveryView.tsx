import { useState } from 'react'
import { useJob } from '@/context/JobContext'

export function TalentDiscoveryView() {
  const { openCandidateDetail } = useJob()
  const [minEvidence, setMinEvidence] = useState<'80%+' | '70%+'>('80%+')
  const [locationPill, setLocationPill] = useState<'Backend · Remote' | 'All'>('Backend · Remote')
  const [isSearching, setIsSearching] = useState(false)

  const results = [
    {
      id: 'CAND-001',
      name: 'Maya Chen',
      fitScore: 92,
      avatar: 'MC',
      whyTheyMatch:
        'billing-worker processes 2M events/day with Redis retries — matches async + billing needs. 5/5 mandatory skills verified in code.',
      socials: [
        { name: 'GitHub', url: 'https://github.com/mayachen' },
        { name: 'LinkedIn', url: 'https://linkedin.com/in/mayachen' },
        { name: 'LeetCode', url: 'https://leetcode.com/mayachen' },
      ],
    },
    {
      id: 'CAND-002',
      name: 'Jonas Weber',
      fitScore: 87,
      avatar: 'JW',
      whyTheyMatch:
        'pay-consumer shows FastAPI + Postgres at scale. Redis evidence weaker — one demo repo only.',
      socials: [
        { name: 'GitHub', url: 'https://github.com/jweber' },
        { name: 'LinkedIn', url: 'https://linkedin.com/in/jweber' },
        { name: 'LeetCode', url: 'https://leetcode.com/jweber' },
      ],
    },
    {
      id: 'CAND-003',
      name: 'Priya Nair',
      fitScore: 81,
      avatar: 'PN',
      whyTheyMatch:
        'Strong FastAPI endpoints + LeetCode depth. No production Redis — gap flagged for interview probe.',
      socials: [
        { name: 'GitHub', url: 'https://github.com/priyanair' },
        { name: 'LinkedIn', url: 'https://linkedin.com/in/priyanair' },
        { name: 'LeetCode', url: 'https://leetcode.com/priyanair' },
      ],
    },
  ]

  const handleDiscover = () => {
    setIsSearching(true)
    setTimeout(() => setIsSearching(false), 600)
  }

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto pb-16 pt-2">
      {/* Top Center Natural-Language Badge & Header (Exact match to Image 5) */}
      <div className="flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#faf5e8] border border-[#ebd8a8] text-[#745723] text-xs font-semibold tracking-wider uppercase mb-3">
          <span className="material-symbols-outlined text-[15px] text-[#c5a467]">auto_awesome</span>
          Natural-Language Search
        </div>

        <h1 className="text-3xl sm:text-4xl font-serif text-[#141618] font-normal tracking-tight">
          Describe the proof you need.
        </h1>
      </div>

      {/* Large Interactive Prompt Panel (Exact match to Image 5) */}
      <div className="bg-white rounded-2xl border-2 border-[#141618] p-6 shadow-card flex flex-col gap-5">
        <div className="text-sm sm:text-base text-[#141618] leading-relaxed flex flex-wrap items-center gap-1.5">
          <span>Find candidates with demonstrated</span>
          <span className="px-2 py-0.5 rounded-md bg-[#faf5e8] border border-[#ebd8a8] text-xs font-semibold text-[#745723]">
            Python
          </span>
          <span className="px-2 py-0.5 rounded-md bg-[#faf5e8] border border-[#ebd8a8] text-xs font-semibold text-[#745723]">
            FastAPI
          </span>
          <span>and</span>
          <span className="px-2 py-0.5 rounded-md bg-[#faf5e8] border border-[#ebd8a8] text-xs font-semibold text-[#745723]">
            PostgreSQL
          </span>
          <span>experience, with production async work.</span>
        </div>

        {/* Bottom Bar: Filters and Discover Button */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#f0ede6]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMinEvidence((e) => (e === '80%+' ? '70%+' : '80%+'))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#e7e2d9] bg-[#f8f7f4] text-xs font-medium text-[#141618] hover:border-[#b0aaa0] transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px] text-[#77736d]">tune</span>
              Evidence {minEvidence}
            </button>

            <button
              type="button"
              onClick={() =>
                setLocationPill((l) => (l === 'Backend · Remote' ? 'All' : 'Backend · Remote'))
              }
              className="px-3 py-1.5 rounded-xl border border-[#e7e2d9] bg-[#f8f7f4] text-xs font-medium text-[#141618] hover:border-[#b0aaa0] transition-colors cursor-pointer"
            >
              {locationPill}
            </button>
          </div>

          <button
            type="button"
            onClick={handleDiscover}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#141618] text-white text-xs font-semibold hover:bg-[#2c3035] transition-colors shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[17px] text-[#c5a467]">auto_awesome</span>
            {isSearching ? 'Discovering…' : 'Discover'}
          </button>
        </div>
      </div>

      {/* Ranked Discovery Matches List (Exact match to Image 5) */}
      <div className="flex flex-col gap-4">
        {results.map((candidate) => (
          <div
            key={candidate.id}
            className="bg-white rounded-2xl border border-[#e7e2d9] p-5 shadow-card hover:shadow-card-hover transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-4 flex-1">
              <div className="w-11 h-11 rounded-full bg-[#f0ede6] flex items-center justify-center text-xs font-bold text-[#5c5549] border border-[#e0dad0] shrink-0 mt-0.5">
                {candidate.avatar}
              </div>

              <div className="flex-1">
                {/* Name & Fit score badge */}
                <div className="flex items-center gap-2.5 mb-1.5">
                  <h3 className="text-base font-bold text-[#141618]">{candidate.name}</h3>
                  <span className="px-2 py-0.5 rounded-md bg-[#faf5e8] border border-[#ebd8a8] text-xs font-bold text-[#745723]">
                    Fit {candidate.fitScore}
                  </span>
                </div>

                {/* AI Reasoning Callout */}
                <div className="flex items-start gap-1.5 text-xs text-[#59616b] leading-relaxed mb-3">
                  <span className="material-symbols-outlined text-[15px] text-[#c5a467] shrink-0 mt-0.5">
                    auto_awesome
                  </span>
                  <span>
                    <strong className="text-[#141618]">Why they match: </strong>
                    {candidate.whyTheyMatch}
                  </span>
                </div>

                {/* Social Badges */}
                <div className="flex items-center gap-2">
                  {candidate.socials.map((s) => (
                    <a
                      key={s.name}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-0.5 rounded-md bg-[#f8f7f4] border border-[#e7e2d9] text-[11px] font-medium text-[#77736d] hover:text-[#141618] transition-colors"
                    >
                      {s.name}
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {/* View Intelligence Action */}
            <button
              type="button"
              onClick={() => openCandidateDetail(candidate.id)}
              className="py-2 px-4 rounded-xl border border-[#e7e2d9] bg-white text-xs font-semibold text-[#141618] hover:bg-[#f8f7f4] transition-colors shadow-2xs shrink-0 self-start sm:self-center cursor-pointer"
            >
              View Intelligence
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

