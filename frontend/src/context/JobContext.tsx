import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { Job } from '@/types'
import { api } from '@/services/api'

interface JobContextType {
  jobs: Job[]
  selectedJob: Job | null
  setSelectedJob: (job: Job | null) => void
  customJD: string
  setCustomJD: (jd: string) => void
  createCustomJob: (title: string, description: string, department?: string, location?: string) => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  selectedSkill: string
  setSelectedSkill: (skill: string) => void
  activeView: 'overview' | 'jobs' | 'candidates' | 'candidate-detail'
  setActiveView: (view: 'overview' | 'jobs' | 'candidates' | 'candidate-detail') => void
  selectedCandidateId: string | null
  openCandidateDetail: (candidateId: string) => void
  backToDashboard: () => void
  isLoadingJobs: boolean
  jobError: string | null
}

const JobContext = createContext<JobContextType | undefined>(undefined)

export function JobProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [customJD, setCustomJD] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedSkill, setSelectedSkill] = useState<string>('')
  const [activeView, setActiveView] = useState<'overview' | 'jobs' | 'candidates' | 'candidate-detail'>('overview')
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [isLoadingJobs, setIsLoadingJobs] = useState<boolean>(true)
  const [jobError, setJobError] = useState<string | null>(null)

  useEffect(() => {
    async function loadJobs() {
      try {
        setIsLoadingJobs(true)
        const fetchedJobs = await api.getJobs()
        setJobs(fetchedJobs)
        if (fetchedJobs.length > 0) {
          setSelectedJob((prev) => prev || fetchedJobs[0])
        }
      } catch (err) {
        console.error('Failed to load seeded jobs:', err)
        setJobError('Failed to load jobs from server.')
      } finally {
        setIsLoadingJobs(false)
      }
    }
    loadJobs()
  }, [])

  const createCustomJob = (title: string, description: string, department = 'Custom Requisition', location = 'Remote') => {
    const newJob: Job = {
      id: `CUSTOM-${Date.now().toString().slice(-4)}`,
      title,
      department,
      location,
      description_raw: description,
      requirements_preview: description.split('\n').filter((l) => l.trim().length > 5).slice(0, 4),
      created_at: new Date().toISOString(),
    }
    setJobs((prev) => [newJob, ...prev])
    setSelectedJob(newJob)
    setCustomJD(description)
  }

  const openCandidateDetail = (candidateId: string) => {
    setSelectedCandidateId(candidateId)
    setActiveView('candidate-detail')
  }

  const backToDashboard = () => {
    setSelectedCandidateId(null)
    setActiveView('overview')
  }

  return (
    <JobContext.Provider
      value={{
        jobs,
        selectedJob,
        setSelectedJob,
        customJD,
        setCustomJD,
        createCustomJob,
        searchQuery,
        setSearchQuery,
        selectedSkill,
        setSelectedSkill,
        activeView,
        setActiveView,
        selectedCandidateId,
        openCandidateDetail,
        backToDashboard,
        isLoadingJobs,
        jobError,
      }}
    >
      {children}
    </JobContext.Provider>
  )
}

export function useJob() {
  const ctx = useContext(JobContext)
  if (!ctx) {
    throw new Error('useJob must be used within a JobProvider')
  }
  return ctx
}
