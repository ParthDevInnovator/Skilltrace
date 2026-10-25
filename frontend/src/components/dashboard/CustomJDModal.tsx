import { useState } from 'react'
import { useJob } from '@/context/JobContext'

interface CustomJDModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CustomJDModal({ isOpen, onClose }: CustomJDModalProps) {
  const { createCustomJob } = useJob()
  const [tab, setTab] = useState<'paste' | 'upload'>('paste')
  const [jobTitle, setJobTitle] = useState('')
  const [department, setDepartment] = useState('Engineering')
  const [location, setLocation] = useState('Remote (US)')
  const [jdText, setJdText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const wordCount = jdText.trim() ? jdText.trim().split(/\s+/).length : 0

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault()
    if (!jobTitle.trim()) {
      setError('Please provide a job title.')
      return
    }
    if (jdText.trim().length < 50) {
      setError('Job description must be at least 50 characters long to extract core requirements.')
      return
    }

    createCustomJob(jobTitle.trim(), jdText.trim(), department.trim(), location.trim())
    onClose()
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    if (!jobTitle) {
      setJobTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '))
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setJdText(text)
    }
    reader.readAsText(file)
  }

  const handleSampleFill = () => {
    setJobTitle('Lead AI & Distributed Systems Architect')
    setDepartment('AI Core Infrastructure')
    setLocation('San Francisco, CA (Hybrid)')
    setJdText(
      `We are looking for a Lead AI & Distributed Systems Architect to drive high-throughput retrieval pipelines and model serving infrastructure.\n\nKey Requirements:\n- 7+ years of experience in distributed systems (Go, Python, Rust, C++).\n- Deep understanding of event streaming with Apache Kafka and RabbitMQ.\n- Hands-on expertise building microservices deployed onto Kubernetes clusters.\n- Experience designing vector search indexes and high-concurrency retrieval endpoints.\n- Solid record of building fault-tolerant backend systems with rigorous testing.`
    )
    setError(null)
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#181c23]/40 flex items-center justify-center p-4">
      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-lg w-full max-w-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#e5e7eb] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#6554c0]">post_add</span>
            <h2 className="text-base font-semibold text-[#181c23]">Add Custom Job Description</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#797584] hover:text-[#181c23] p-1 rounded hover:bg-[#f1f3fe]"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleApply} className="p-6 flex flex-col gap-4">
          {/* Tab Selector */}
          <div className="flex items-center gap-2 border-b border-[#e5e7eb] pb-2">
            <button
              type="button"
              onClick={() => setTab('paste')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                tab === 'paste'
                  ? 'bg-[#f1eefc] text-[#4d3aa6] border border-[#6554c0]'
                  : 'text-[#484552] hover:bg-[#f8fafc]'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">edit_note</span>
              <span>Paste Text</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('upload')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                tab === 'upload'
                  ? 'bg-[#f1eefc] text-[#4d3aa6] border border-[#6554c0]'
                  : 'text-[#484552] hover:bg-[#f8fafc]'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">upload_file</span>
              <span>Upload Document (.txt, .pdf)</span>
            </button>

            <button
              type="button"
              onClick={handleSampleFill}
              className="ml-auto text-[11px] text-[#6554c0] hover:underline flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[14px]">auto_fix_high</span>
              <span>Load Sample JD</span>
            </button>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2 flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#181c23]">Job Title *</label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => {
                  setJobTitle(e.target.value)
                  setError(null)
                }}
                placeholder="e.g. Senior Machine Learning Engineer"
                className="h-8 px-3 rounded border border-[#e5e7eb] text-xs focus:outline-none focus:border-[#6554c0]"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#181c23]">Department</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Infrastructure"
                className="h-8 px-3 rounded border border-[#e5e7eb] text-xs focus:outline-none focus:border-[#6554c0]"
              />
            </div>
          </div>

          {tab === 'upload' && (
            <div className="border-2 border-dashed border-[#c9c4d4] rounded-lg p-6 flex flex-col items-center justify-center gap-2 bg-[#f9f9ff]">
              <span className="material-symbols-outlined text-[32px] text-[#6554c0]">
                cloud_upload
              </span>
              <p className="text-xs text-[#484552] font-medium text-center">
                Drag and drop your JD file here, or{' '}
                <label className="text-[#6554c0] hover:underline cursor-pointer">
                  browse files
                  <input
                    type="file"
                    accept=".txt,.md,.pdf,.docx"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </p>
              <span className="text-[10px] text-[#797584]">
                Supported formats: Plain Text (.txt), Markdown (.md), PDF
              </span>
              {fileName && (
                <div className="mt-2 text-xs font-semibold text-[#247a52] bg-[#edf7f2] border border-[#b7e2ce] px-2.5 py-1 rounded flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  <span>Loaded: {fileName}</span>
                </div>
              )}
            </div>
          )}

          {/* JD Textarea */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#181c23]">
                Job Description Text *
              </label>
              <span className="text-[11px] text-[#65646f] font-mono">
                {wordCount} words ({jdText.length} characters)
              </span>
            </div>
            <textarea
              rows={8}
              value={jdText}
              onChange={(e) => {
                setJdText(e.target.value)
                setError(null)
              }}
              placeholder="Paste the full job requirements and description here..."
              className="w-full p-3 rounded border border-[#e5e7eb] text-xs font-sans leading-relaxed focus:outline-none focus:border-[#6554c0]"
              required
            />
          </div>

          {error && (
            <div className="text-xs text-[#b54747] bg-[#fdf2f2] border border-[#f5c4c4] px-3 py-2 rounded">
              {error}
            </div>
          )}

          {/* Modal Footer */}
          <div className="border-t border-[#e5e7eb] pt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded text-xs font-semibold text-[#484552] hover:bg-[#f1f3fe]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded text-xs font-semibold bg-[#6554c0] text-white hover:bg-[#5545a8] shadow-sm flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">check</span>
              <span>Set as Active Requisition</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
