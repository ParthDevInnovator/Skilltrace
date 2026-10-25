import { useState } from 'react'
import { JobProvider, useJob } from '@/context/JobContext'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { DashboardOverview } from '@/components/dashboard/DashboardOverview'
import { CandidateProfileShell } from '@/components/profile/CandidateProfileShell'
import { CustomJDModal } from '@/components/dashboard/CustomJDModal'

function WorkspaceContent() {
  const { activeView } = useJob()
  const [isCustomJDModalOpen, setIsCustomJDModalOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#f9f9ff] text-[#181c23]">
      <Sidebar />
      <div className="pl-60 flex flex-col min-h-screen">
        <Header onOpenCustomJDModal={() => setIsCustomJDModalOpen(true)} />
        <main className="w-full pt-20 px-6 pb-12 flex-1">
          {activeView === 'candidate-detail' ? (
            <CandidateProfileShell />
          ) : (
            <DashboardOverview onOpenCustomJDModal={() => setIsCustomJDModalOpen(true)} />
          )}
        </main>
      </div>

      <CustomJDModal
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
