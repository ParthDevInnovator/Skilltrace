import { useState } from 'react'
import { JobProvider, useJob } from '@/context/JobContext'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { DashboardOverview } from '@/components/dashboard/DashboardOverview'
import { CandidateProfileShell } from '@/components/profile/CandidateProfileShell'
import { JobsView } from '@/components/dashboard/JobsView'
import { EvidenceExplorer } from '@/components/evidence/EvidenceExplorer'
import { CandidateGrid } from '@/components/dashboard/CandidateGrid'
import { CustomJDModal } from '@/components/dashboard/CustomJDModal'

function WorkspaceContent() {
  const { activeView, selectedCandidateId } = useJob()
  const [isCustomJDModalOpen, setIsCustomJDModalOpen] = useState(false)

  return (
    <div className="w-full min-h-screen bg-[#f9f9ff] text-[#181c23]">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Sidebar />
      <div className="workspace-content flex flex-col min-h-screen">
        <Header onOpenCustomJDModal={() => setIsCustomJDModalOpen(true)} />
        <main id="main-content" tabIndex={-1} className="workspace-main flex-1">
          {activeView === 'candidate-detail' ? (
            <CandidateProfileShell key={selectedCandidateId} />
          ) : activeView === 'evidence' ? (<EvidenceExplorer />) : activeView === 'jobs' ? (<JobsView onCreate={() => setIsCustomJDModalOpen(true)} />) : activeView === 'candidates' ? (<section className="page-stack"><h1>Candidates</h1><p>Browse candidate profiles and evidence. Role fit is not assessed yet.</p><CandidateGrid /></section>) : (
            <DashboardOverview onOpenCustomJDModal={() => setIsCustomJDModalOpen(true)} />
          )}
        </main>
      </div>

      <CustomJDModal
        key={String(isCustomJDModalOpen)}
        isOpen={isCustomJDModalOpen}
        onClose={() => setIsCustomJDModalOpen(false)}
      />
    </div>
  )
}

export default function App() {
  return (
    <JobProvider>
      <WorkspaceContent />
    </JobProvider>
  )
}
