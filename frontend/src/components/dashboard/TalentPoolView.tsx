import { useState } from 'react'
import { useJob } from '@/context/JobContext'

export function TalentPoolView() {
  const { openCandidateDetail, setActiveView } = useJob()
  const [search, setSearch] = useState('')
  const [activeSkillFilter, setActiveSkillFilter] = useState<'All' | 'Python' | 'FastAPI' | 'React' | 'Kafka'>('Kafka')
  const [evidenceFilter, setEvidenceFilter] = useState<'All' | '70%+'>('70%+')

  const candidates = [
    {
      id: 'CAND-001',
      name: 'Maya Chen',
      role: 'Backend Engineer · Berlin',
      score: 92,
      skills: ['Python'],
      extraSkillsCount: 3,
      evidencePercent: 94,
      avatar: 'MC',
    },
    {
      id: 'CAND-002',
      name: 'Jonas Weber',
      role: 'AI Engineer · Munich',
      score: 88,
      skills: ['Python'],
      extraSkillsCount: 3,
      evidencePercent: 87,
      avatar: 'JW',
    },
    {
      id: 'CAND-003',
      name: 'Priya Nair',
      role: 'Full Stack · Amsterdam',
      score: 84,
      skills: ['Python'],
      extraSkillsCount: 3,
      evidencePercent: 81,
      avatar: 'PN',
    },
    {
      id: 'CAND-004',
      name: 'Sam Okonkwo',
      role: 'Backend · Remote',
      score: 77,
      skills: ['Python'],
      extraSkillsCount: 3,
      evidencePercent: 72,
      avatar: 'SO',
    },
    {
      id: 'CAND-005',
      name: 'Lina Haddad',
      role: 'ML Engineer · Paris',
      score: 79,
      skills: ['Python'],
      extraSkillsCount: 3,
      evidencePercent: 76,
      avatar: 'LH',
    },
    {
      id: 'CAND-006',
      name: 'Theo Lindqvist',
      role: 'DevOps · Stockholm',
      score: 75,
      skills: ['Python'],
      extraSkillsCount: 3,
      evidencePercent: 69,
      avatar: 'TL',
    },
  ]

  const filteredCandidates = candidates.filter((c) => {
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!c.name.toLowerCase().includes(q) && !c.role.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-16">
      {/* Page Title & Add Resumes Button (Exact match to Image 4) */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-1">
        <div>
          <h1 className="text-3xl font-serif text-[#141618] font-normal tracking-tight mb-1">
            Talent Pool
          </h1>
          <p className="text-sm text-[#77736d]">
            A searchable library of verified candidate intelligence — not a contact list.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActiveView('add-candidates')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#141618] text-white text-xs font-semibold hover:bg-[#2c3035] transition-colors shadow-sm self-start sm:self-auto cursor-pointer"
        >
          <span className="material-symbols-outlined text-[17px]">upload_file</span>
          Add Resumes
        </button>
      </div>

      {/* Filter and Search Bar (Exact match to Image 4) */}
      <div className="bg-white rounded-2xl border border-[#e7e2d9] p-5 shadow-card flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[19px] text-[#9c9890]">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, skill, project, company..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#e7e2d9] bg-[#fdfcfb] text-xs text-[#141618] placeholder-[#9c9890] focus:outline-none focus:border-[#141618] transition-colors"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className="px-3.5 py-2 rounded-xl border border-[#e7e2d9] bg-[#f8f7f4] text-xs font-medium text-[#59616b] hover:text-[#141618] transition-colors cursor-pointer"
            >
              Skills
            </button>
            <button
              type="button"
              className="px-3.5 py-2 rounded-xl border border-[#e7e2d9] bg-[#f8f7f4] text-xs font-medium text-[#59616b] hover:text-[#141618] transition-colors cursor-pointer"
            >
              Platform
            </button>
            <button
              type="button"
              onClick={() => setEvidenceFilter((f) => (f === '70%+' ? 'All' : '70%+'))}
              className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                evidenceFilter === '70%+'
                  ? 'bg-[#faf5e8] border-[#ebd8a8] text-[#745723]'
                  : 'border-[#e7e2d9] bg-[#f8f7f4] text-[#59616b]'
              }`}
            >
              Evidence 70%+
            </button>
          </div>
        </div>

        {/* Applied Tag Pills Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#f0ede6]">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSkillFilter('Python')}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                activeSkillFilter === 'Python'
                  ? 'bg-[#141618] text-white border-transparent'
                  : 'bg-[#faf9f6] border-[#e7e2d9] text-[#59616b]'
              }`}
            >
              Python
            </button>
            <button
              type="button"
              onClick={() => setActiveSkillFilter('FastAPI')}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                activeSkillFilter === 'FastAPI'
                  ? 'bg-[#141618] text-white border-transparent'
                  : 'bg-[#faf9f6] border-[#e7e2d9] text-[#59616b]'
              }`}
            >
              FastAPI
            </button>
            <button
              type="button"
              onClick={() => setActiveSkillFilter('React')}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                activeSkillFilter === 'React'
                  ? 'bg-[#141618] text-white border-transparent'
                  : 'bg-[#faf9f6] border-[#e7e2d9] text-[#59616b]'
              }`}
            >
              React
            </button>
            <button
              type="button"
              onClick={() => setActiveSkillFilter((s) => (s === 'Kafka' ? 'All' : 'Kafka'))}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                activeSkillFilter === 'Kafka'
                  ? 'bg-[#141618] text-white'
                  : 'bg-[#faf9f6] border border-[#e7e2d9] text-[#59616b]'
              }`}
            >
              Kafka
              {activeSkillFilter === 'Kafka' && <span className="text-white/60">×</span>}
            </button>
          </div>

          <div className="text-xs text-[#77736d] font-medium">
            248 profiles · Updated hourly
          </div>
        </div>
      </div>

      {/* 3x2 Grid of Candidate Bento Cards (Exact match to Image 4) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredCandidates.map((candidate) => (
          <div
            key={candidate.id}
            className="bg-white rounded-2xl border border-[#e7e2d9] p-5 shadow-card hover:shadow-card-hover transition-all flex flex-col justify-between"
          >
            <div>
              {/* Header: Avatar, Name, Role and Score */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#f0ede6] flex items-center justify-center text-xs font-bold text-[#5c5549] border border-[#e0dad0] shrink-0">
                    {candidate.avatar}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#141618]">{candidate.name}</h3>
                    <p className="text-xs text-[#77736d]">{candidate.role}</p>
                  </div>
                </div>

                <div className="text-2xl font-serif font-bold text-[#b89345]">
                  {candidate.score}
                </div>
              </div>

              {/* Skills Badges */}
              <div className="flex items-center gap-2 mb-4">
                {candidate.skills.map((s) => (
                  <span
                    key={s}
                    className="px-2.5 py-0.5 rounded-md bg-[#faf9f6] border border-[#e7e2d9] text-xs font-medium text-[#141618]"
                  >
                    {s}
                  </span>
                ))}
                <span className="px-2 py-0.5 rounded-md bg-[#f4f2ee] text-xs text-[#77736d] font-medium">
                  +{candidate.extraSkillsCount} verified
                </span>
              </div>

              {/* Evidence Progress Bar */}
              <div className="mb-5">
                <div className="flex items-center justify-between text-xs font-medium text-[#77736d] mb-1.5">
                  <span>Evidence {candidate.evidencePercent}%</span>
                </div>
                <div className="w-full h-1.5 bg-[#f0ede6] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#c5a467] rounded-full"
                    style={{ width: `${candidate.evidencePercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Bottom Actions: View Intelligence + Compare */}
            <div className="flex items-center gap-2 pt-4 border-t border-[#f0ede6]">
              <button
                type="button"
                onClick={() => openCandidateDetail(candidate.id)}
                className="flex-1 py-2 px-3 rounded-xl border border-[#e7e2d9] bg-white text-xs font-semibold text-[#141618] hover:bg-[#f8f7f4] transition-colors shadow-2xs text-center cursor-pointer"
              >
                View Intelligence
              </button>

              <button
                type="button"
                aria-label={`Compare ${candidate.name}`}
                onClick={() => setActiveView('comparison')}
                className="w-9 h-9 rounded-xl bg-[#141618] flex items-center justify-center text-white hover:bg-[#2c3035] transition-colors shadow-2xs cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-[17px]">compare_arrows</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

