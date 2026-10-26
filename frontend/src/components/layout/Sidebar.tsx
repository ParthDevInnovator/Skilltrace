import { useJob } from '@/context/JobContext'
export function Sidebar() {
  const { activeView, setActiveView } = useJob()
  return <aside className="workspace-sidebar">
    <div className="brand"><span className="brand-mark">ST</span><div><strong>Skilltrace</strong><small>Trace Skills to Evidence</small></div></div>
    <nav aria-label="Workspace" className="workspace-nav">
      {(['overview', 'jobs', 'candidates'] as const).map(view => <button key={view} aria-current={(activeView === view || view === 'candidates' && activeView === 'candidate-detail') ? 'page' : undefined} onClick={() => setActiveView(view)}>{view[0].toUpperCase() + view.slice(1)}</button>)}
      <span className="future-feature">Evidence Explorer <small>Phase 2</small></span>
    </nav>
    <div className="demo-identity"><strong>Demo recruiter</strong><small>Seeded workspace - No account connected</small></div>
  </aside>
}
