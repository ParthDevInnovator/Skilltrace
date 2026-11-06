import { useJob } from '@/context/JobContext'

interface CandidateComparisonProps {
  onBack?: () => void
}

export function CandidateComparisonView({ onBack }: CandidateComparisonProps) {
  const { selectedJob, openCandidateDetail, setActiveView } = useJob()
  const jobTitle = selectedJob?.title || 'Backend Engineer'

  const comparisonRows = [
    {
      label: 'Job Fit',
      isDiff: true,
      col1: '92 — Exceptional',
      col2: '88 — Strong',
    },
    {
      label: 'Mandatory Skills',
      isDiff: false,
      col1: '5 / 5',
      col2: '5 / 5',
    },
    {
      label: 'Evidence Coverage',
      isDiff: true,
      col1: '94%',
      col2: '87%',
    },
    {
      label: 'Python',
      isDiff: false,
      col1: 'Verified · 6 repos',
      col2: 'Verified · 4 repos',
    },
    {
      label: 'FastAPI',
      isDiff: true,
      col1: 'Verified · 18 endpoints',
      col2: 'Demonstrated · 6 endpoints',
    },
    {
      label: 'PostgreSQL',
      isDiff: true,
      col1: 'Demonstrated',
      col2: 'Verified · tuning',
    },
    {
      label: 'Redis',
      isDiff: true,
      col1: 'Demonstrated · 2 repos',
      col2: 'Unverified',
    },
    {
      label: 'Kafka',
      isDiff: true,
      col1: 'Unverified',
      col2: 'Demonstrated',
    },
    {
      label: 'Top Project',
      isDiff: false,
      col1: 'billing-worker · 2M/d',
      col2: 'pay-consumer · 800k/d',
    },
    {
      label: 'Experience',
      isDiff: false,
      col1: '6 yrs · fintech',
      col2: '5 yrs · SaaS',
    },
  ]

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-16">
      {/* Breadcrumb Navigation (Exact match to Image 1) */}
      <div className="flex items-center justify-between pt-1">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[#77736d]">
          <button
            type="button"
            onClick={() => setActiveView('jobs')}
            className="hover:text-[#141618] transition-colors cursor-pointer"
          >
            Jobs
          </button>
          <span>/</span>
          <button
            type="button"
            onClick={() => {
              if (onBack) onBack()
              else setActiveView('job-detail')
            }}
            className="hover:text-[#141618] transition-colors cursor-pointer"
          >
            {jobTitle}
          </button>
          <span>/</span>
          <span className="font-semibold text-[#141618]">Comparison</span>
        </nav>
      </div>

      {/* Header and Add Candidate Button */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-[#141618] font-normal tracking-tight mb-1">
            Candidate Comparison
          </h1>
          <p className="text-sm text-[#77736d]">
            Side-by-side evidence for {jobTitle}. Differences highlighted in gold.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActiveView('candidates')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#e7e2d9] bg-white text-xs font-semibold text-[#141618] hover:bg-[#f8f7f4] transition-colors shadow-2xs self-start sm:self-auto cursor-pointer"
        >
          <span className="material-symbols-outlined text-[17px] text-[#77736d]">add</span>
          Add candidate
        </button>
      </div>

      {/* Side-by-Side Comparison Matrix (Exact match to Image 1) */}
      <div className="bg-white rounded-2xl border border-[#e7e2d9] shadow-card overflow-hidden">
        {/* Table Column Headers */}
        <div className="grid grid-cols-12 border-b border-[#e7e2d9] bg-white py-5 px-6 items-center">
          <div className="col-span-4 text-xs font-bold text-[#9c9890] tracking-wider uppercase">
            2 SELECTED · MAX 3
          </div>

          {/* Candidate 1: Maya Chen */}
          <div className="col-span-4 flex items-center justify-between pr-6 border-r border-[#f0ece1]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#e8e4dc] flex items-center justify-center text-xs font-bold text-[#5c5549] overflow-hidden shrink-0 border border-[#e0dad0]">
                MC
              </div>
              <div>
                <div className="text-sm font-bold text-[#141618]">Maya Chen</div>
                <div className="text-xs text-[#77736d]">Backend engineer</div>
              </div>
            </div>
            <div className="text-2xl font-serif font-bold text-[#b89345]">92</div>
          </div>

          {/* Candidate 2: Jonas Weber */}
          <div className="col-span-4 flex items-center justify-between pl-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#dce1e8] flex items-center justify-center text-xs font-bold text-[#4a586d] overflow-hidden shrink-0 border border-[#cfd7e0]">
                JW
              </div>
              <div>
                <div className="text-sm font-bold text-[#141618]">Jonas Weber</div>
                <div className="text-xs text-[#77736d]">Backend engineer</div>
              </div>
            </div>
            <div className="text-2xl font-serif font-bold text-[#b89345]">88</div>
          </div>
        </div>

        {/* Matrix Rows */}
        <div className="divide-y divide-[#f0ede6]">
          {comparisonRows.map((row) => (
            <div
              key={row.label}
              className={`grid grid-cols-12 px-6 py-4 items-center text-xs transition-colors ${
                row.isDiff ? 'bg-[#faf6ee]' : 'bg-white hover:bg-[#faf9f6]'
              }`}
            >
              <div className="col-span-4 flex items-center gap-2 font-medium text-[#141618]">
                {row.isDiff ? (
                  <span className="w-1.5 h-1.5 rounded-xs bg-[#c5a467] shrink-0" />
                ) : (
                  <span className="w-1.5 h-1.5 shrink-0" />
                )}
                <span className={row.isDiff ? 'font-semibold text-[#141618]' : 'text-[#59616b]'}>
                  {row.label}
                </span>
              </div>

              <div
                className={`col-span-4 pr-6 ${
                  row.isDiff ? 'font-semibold text-[#141618]' : 'text-[#59616b]'
                }`}
              >
                {row.col1}
              </div>

              <div
                className={`col-span-4 pl-6 ${
                  row.isDiff ? 'font-semibold text-[#141618]' : 'text-[#59616b]'
                }`}
              >
                {row.col2}
              </div>
            </div>
          ))}
        </div>

        {/* Action Footer Buttons */}
        <div className="grid grid-cols-12 border-t border-[#e7e2d9] bg-[#faf9f6] py-5 px-6 items-center">
          <div className="col-span-4" />

          {/* View Maya's Intelligence */}
          <div className="col-span-4 pr-6">
            <button
              type="button"
              onClick={() => openCandidateDetail('CAND-001')}
              className="w-full py-2.5 px-4 rounded-xl bg-[#141618] text-white text-xs font-semibold hover:bg-[#2c3035] transition-colors shadow-sm cursor-pointer"
            >
              View Maya&apos;s Intelligence
            </button>
          </div>

          {/* View Jonas's Intelligence */}
          <div className="col-span-4 pl-6">
            <button
              type="button"
              onClick={() => openCandidateDetail('CAND-002')}
              className="w-full py-2.5 px-4 rounded-xl border border-[#e7e2d9] bg-white text-[#141618] text-xs font-semibold hover:bg-[#f8f7f4] transition-colors shadow-2xs cursor-pointer"
            >
              View Jonas&apos;s Intelligence
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

