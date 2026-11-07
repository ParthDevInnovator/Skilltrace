import { useEffect, useRef } from 'react'
import { useJob } from '@/context/JobContext'
import { JobSelector } from '@/components/dashboard/JobSelector'
import { useAuth } from '@/context/AuthContext'

export function Header({
  onOpenCustomJDModal,
  onOpenChat,
}: {
  onOpenCustomJDModal: () => void
  onOpenChat: () => void
}) {
  const { searchQuery, setSearchQuery, activeView, setActiveView } = useJob()
  const { hasRole } = useAuth()
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [setActiveView])

  return (
    <header className="workspace-header sticky top-0 z-30 min-h-16 bg-[#ffffff]/90 backdrop-blur-md border-b border-[#e7e2d9] px-6 lg:px-8 flex items-center justify-between">
      {/* Search Input Bar + Requisition Selector (Exact match to Images 3 and 5 + Accessible Job Selector) */}
      <div className="flex items-center gap-4 flex-1 max-w-xl">
        <div className="relative w-full max-w-xs sm:max-w-md">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#59616b] text-[19px]">
            search
          </span>
          <label className="sr-only" htmlFor="candidate-search">
            Search candidates
          </label>
          <input
            id="candidate-search"
            ref={searchRef}
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value)
              if (activeView !== 'candidates' && activeView !== 'talent-pool') {
                setActiveView('candidates')
              }
            }}
            placeholder="Search candidates, skills..."
            className="w-full h-10 pl-10 pr-10 rounded-xl bg-[#f8f7f4] border border-[#e7e2d9] text-[#141618] placeholder-[#9c9890] text-xs focus:outline-none focus:border-[#a9874e] focus:bg-white transition-all shadow-inner"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded border border-[#e7e2d9] bg-white text-[10px] text-[#59616b] font-mono shadow-2xs">
            K
          </kbd>
        </div>

        {/* Embedded Job Selector (Accessible requisition dropdown) */}
        {activeView !== 'overview' && activeView !== 'jobs' && <div className="header-job">
          <JobSelector onOpenCustomJDModal={onOpenCustomJDModal} />
        </div>}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Chat Drawer Trigger */}
        {activeView !== 'overview' && activeView !== 'jobs' && <button
          type="button"
          onClick={onOpenChat}
          title="Open AI Assistant"
          className="h-9 px-3 rounded-lg border border-[#e7e2d9] bg-white hover:bg-[#f8f7f4] text-[#141618] text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[17px] text-[#a9874e]">auto_awesome</span>
          <span className="hidden sm:inline">Ask AI</span>
        </button>}

        {/* Notifications Icon Button */}
        <button
          type="button"
          disabled aria-label="Notifications (not available)" title="Notifications are not available"
          className="relative w-9 h-9 rounded-lg border border-[#e7e2d9] bg-white hover:bg-[#f8f7f4] text-[#59616b] hover:text-[#141618] flex items-center justify-center transition-colors shadow-2xs"
        >
          <span className="material-symbols-outlined text-[19px]">notifications</span>
          <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#a9874e]" />
        </button>

        {/* Create Job Primary Button */}
        <button
          type="button"
          id="btn-create-job"
          disabled={!hasRole('recruiter')}
          onClick={onOpenCustomJDModal}
          className="h-9 px-4 rounded-lg bg-[#141618] hover:bg-[#2a2d32] text-white font-medium text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add</span>
          <span>Create Job</span>
        </button>
      </div>
    </header>
  )
}

