import { useEffect, useRef } from 'react'
import { useJob } from '@/context/JobContext'
import { JobSelector } from '@/components/dashboard/JobSelector'
export function Header({ onOpenCustomJDModal }: { onOpenCustomJDModal: () => void }) {
  const { searchQuery, setSearchQuery, activeView, setActiveView } = useJob()
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setActiveView('candidates')
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [setActiveView])
  return <header className="workspace-header">
    <div className="header-job"><span className="breadcrumb">Workspace / {activeView === 'candidate-detail' ? 'Candidate Profile' : activeView}</span><JobSelector onOpenCustomJDModal={onOpenCustomJDModal} /></div>
    <div className="header-search"><label className="sr-only" htmlFor="candidate-search">Search candidates</label><input id="candidate-search" ref={searchRef} value={searchQuery} onChange={e => { setSearchQuery(e.target.value); if (activeView === 'jobs' || activeView === 'candidate-detail' || activeView === 'evidence') setActiveView('candidates') }} placeholder="Search candidates or skills" /><kbd>Ctrl/K</kbd></div>
  </header>
}
