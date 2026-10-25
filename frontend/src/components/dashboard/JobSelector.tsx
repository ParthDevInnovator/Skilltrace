import { useState, useRef, useEffect } from 'react'
import { useJob } from '@/context/JobContext'

interface JobSelectorProps {
  onOpenCustomJDModal: () => void
}

export function JobSelector({ onOpenCustomJDModal }: JobSelectorProps) {
  const { jobs, selectedJob, setSelectedJob } = useJob()
  const [isOpen, setIsOpen] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredJobs = jobs.filter((j) => {
    if (!searchFilter.trim()) return true
    const q = searchFilter.toLowerCase()
    return (
      j.title.toLowerCase().includes(q) ||
      j.department.toLowerCase().includes(q) ||
      j.location.toLowerCase().includes(q) ||
      j.id.toLowerCase().includes(q)
    )
  })

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#f1f3fe] border border-[#e5e7eb] hover:bg-[#ebedf9] text-left transition-colors"
      >
        <span className="material-symbols-outlined text-[16px] text-[#6554c0]">cases</span>
        <span className="text-xs font-semibold text-[#181c23] truncate max-w-[200px]">
          {selectedJob ? selectedJob.title : 'Select Active Job...'}
        </span>
        {selectedJob && (
          <span className="text-[10px] font-semibold bg-[#dfe2ed] text-[#484552] px-1.5 py-0.5 rounded">
            #{selectedJob.id}
          </span>
        )}
        <span className="material-symbols-outlined text-[16px] text-[#797584]">
          {isOpen ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 bg-white border border-[#e5e7eb] rounded-lg shadow-lg z-50 p-2 flex flex-col gap-2">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-2 text-[16px] text-[#797584]">
              search
            </span>
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search sample jobs or reqs..."
              className="w-full h-8 pl-8 pr-3 text-xs rounded border border-[#e5e7eb] focus:outline-none focus:border-[#6554c0]"
              autoFocus
            />
          </div>

          <div className="max-h-60 overflow-y-auto flex flex-col gap-1">
            {filteredJobs.map((job) => {
              const isSelected = selectedJob?.id === job.id
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => {
                    setSelectedJob(job)
                    setIsOpen(false)
                  }}
                  className={`flex flex-col text-left px-2.5 py-2 rounded text-xs transition-colors ${
                    isSelected ? 'bg-[#f1eefc] border-l-2 border-[#6554c0]' : 'hover:bg-[#f8fafc]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#181c23] truncate">{job.title}</span>
                    <span className="text-[10px] text-[#6554c0] bg-[#f1eefc] px-1 py-0.5 rounded font-mono">
                      #{job.id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[#65646f] mt-0.5">
                    <span>{job.department}</span>
                    <span>•</span>
                    <span>{job.location}</span>
                  </div>
                </button>
              )
            })}
            {filteredJobs.length === 0 && (
              <div className="text-center py-4 text-xs text-[#797584]">
                No jobs match "{searchFilter}"
              </div>
            )}
          </div>

          <div className="border-t border-[#e5e7eb] pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false)
                onOpenCustomJDModal()
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded text-xs font-semibold bg-[#6554c0] text-white hover:bg-[#5545a8] transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>Input Custom JD Text</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
