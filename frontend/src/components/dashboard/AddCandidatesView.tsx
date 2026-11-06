import { useState, useRef } from 'react'
import { useJob } from '@/context/JobContext'

export function AddCandidatesView() {
  const { selectedJob, setActiveView } = useJob()
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const [singleFile, setSingleFile] = useState<{
    name: string
    size: string
    pages: string
    status: string
    progress: number
  } | null>({
    name: 'maya-chen-resume.pdf',
    size: '1.8 MB',
    pages: '2 pages',
    status: 'Parsed',
    progress: 100,
  })

  const [batchFiles] = useState([
    { name: 'jonas-weber.pdf', size: '2.1 MB', progress: 100, color: 'bg-[#247a52]' },
    { name: 'priya-nair.pdf', size: '1.4 MB', progress: 100, color: 'bg-[#247a52]' },
    { name: 'sam-okonkwo.pdf', size: '2.6 MB', progress: 68, color: 'bg-[#c5a467]' },
    { name: 'lina-haddad.pdf', size: '1.9 MB', progress: 32, color: 'bg-[#c5a467]' },
  ])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const jobTitle = selectedJob?.title || 'Backend Engineer'

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col">
      {/* Top Navigation Bar (Exact match to Image 2) */}
      <header className="h-16 bg-white border-b border-[#e7e2d9] px-6 lg:px-10 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#141618] flex items-center justify-center text-white font-serif italic text-base shrink-0 shadow-sm">
            S
          </div>
          <span className="font-sans font-bold text-base tracking-tight text-[#141618]">skitrace</span>
          <span className="text-xs text-[#77736d]">
            {jobTitle} · Add Candidates
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-[#247a52] font-semibold">
            <span className="material-symbols-outlined text-[16px]">check_circle</span>
            <span>Requirements saved</span>
          </div>
          <button
            type="button"
            onClick={() => setActiveView('job-detail')}
            className="text-xs text-[#77736d] hover:text-[#141618] cursor-pointer"
          >
            Back to workspace
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl w-full mx-auto p-6 sm:p-10 flex flex-col gap-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-serif text-[#141618] font-normal tracking-tight mb-1">
            Add Candidates
          </h1>
          <p className="text-[#77736d] text-sm">
            Upload resumes to discover the evidence behind each candidate.
          </p>
        </div>

        {/* View Toggle Mode Pills */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`h-9 px-4 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              mode === 'single'
                ? 'bg-[#141618] text-white shadow-sm'
                : 'bg-white border border-[#e7e2d9] text-[#59616b] hover:text-[#141618]'
            }`}
          >
            Single Resume
          </button>

          <button
            type="button"
            onClick={() => setMode('batch')}
            className={`h-9 px-4 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              mode === 'batch'
                ? 'bg-[#141618] text-white shadow-sm'
                : 'bg-white border border-[#e7e2d9] text-[#59616b] hover:text-[#141618]'
            }`}
          >
            Batch Upload
          </button>
        </div>

        {/* Two-Column Dropzone & Queue Cards (Exact match to Image 2) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* LEFT CARD: Single Resume */}
          <div
            className={`bg-white rounded-2xl border p-6 sm:p-8 flex flex-col justify-between gap-6 transition-all ${
              mode === 'single'
                ? 'border-[#ebd8a8] shadow-card ring-1 ring-[#ebd8a8]'
                : 'border-[#e7e2d9] shadow-card opacity-90'
            }`}
          >
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#141618] uppercase tracking-wider">
                <span className="material-symbols-outlined text-[18px] text-[#77736d]">description</span>
                <span>Single Resume</span>
              </div>

              {/* Dashed Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#e7e2d9] hover:border-[#a9874e] rounded-2xl p-8 flex flex-col items-center justify-center text-center bg-[#faf9f6] transition-colors cursor-pointer"
              >
                <div className="w-12 h-12 rounded-xl bg-[#faf5e8] border border-[#ebd8a8] flex items-center justify-center text-[#745723] mb-3">
                  <span className="material-symbols-outlined text-[24px]">note_add</span>
                </div>
                <p className="text-xs font-medium text-[#141618] mb-3">
                  Drag and drop resume PDF
                </p>
                <button
                  type="button"
                  className="h-8 px-4 rounded-lg bg-[#141618] text-white text-xs font-medium shadow-2xs hover:bg-[#2a2d32] transition-colors"
                >
                  Browse Files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) {
                      setSingleFile({
                        name: f.name,
                        size: `${(f.size / (1024 * 1024)).toFixed(1)} MB`,
                        pages: '2 pages',
                        status: 'Parsed',
                        progress: 100,
                      })
                    }
                  }}
                />
              </div>

              {/* Uploaded File Item */}
              {singleFile && (
                <div className="p-3.5 rounded-xl bg-[#faf9f6] border border-[#e7e2d9] flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[#fdf2f2] border border-[#f5c4c4] flex items-center justify-center text-[#b54747] text-xs font-bold shrink-0">
                        PDF
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#141618] truncate">
                          {singleFile.name}
                        </div>
                        <div className="text-[11px] text-[#77736d]">
                          {singleFile.size} · {singleFile.pages} · {singleFile.status}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSingleFile(null)}
                      className="text-[#77736d] hover:text-[#141618] p-1"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>

                  {/* 100% Green Progress Bar */}
                  <div className="w-full h-1.5 rounded-full bg-[#eeece6] overflow-hidden">
                    <div
                      className="h-full bg-[#247a52] rounded-full transition-all"
                      style={{ width: `${singleFile.progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Action Button: Start Analysis */}
            <button
              type="button"
              onClick={() => setActiveView('pipeline')}
              disabled={!singleFile}
              className="w-full h-11 rounded-xl bg-[#141618] hover:bg-[#2a2d32] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[17px] text-[#d4af37]">auto_awesome</span>
              <span>Start Analysis</span>
            </button>
          </div>

          {/* RIGHT CARD: Batch Upload */}
          <div
            className={`bg-white rounded-2xl border p-6 sm:p-8 flex flex-col justify-between gap-6 transition-all ${
              mode === 'batch'
                ? 'border-[#ebd8a8] shadow-card ring-1 ring-[#ebd8a8]'
                : 'border-[#e7e2d9] shadow-card'
            }`}
          >
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#141618] uppercase tracking-wider">
                <span className="material-symbols-outlined text-[18px] text-[#77736d]">layers</span>
                <span>Batch Upload · 4 files queued</span>
              </div>

              {/* Dashed Dropzone */}
              <div
                onClick={() => setMode('batch')}
                className="border-2 border-dashed border-[#e7e2d9] hover:border-[#a9874e] rounded-2xl p-6 flex flex-col items-center justify-center text-center bg-[#faf9f6] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-[#77736d]">
                  <span className="material-symbols-outlined text-[18px]">upload</span>
                  <span>Drop multiple PDFs here</span>
                </div>
              </div>

              {/* 4 Queued Files List */}
              <div className="space-y-3">
                {batchFiles.map((file, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-[#faf9f6] border border-[#e7e2d9] space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 truncate">
                        <span className="material-symbols-outlined text-[16px] text-[#77736d]">description</span>
                        <span className="font-semibold text-[#141618] truncate">{file.name}</span>
                        <span className="text-[#77736d]">· {file.size}</span>
                      </div>
                      <span className="font-bold text-[#141618] text-[11px] shrink-0">
                        {file.progress}%
                      </span>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-[#eeece6] overflow-hidden">
                      <div
                        className={`h-full ${file.color} rounded-full transition-all`}
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Button: Start Batch Analysis (4) */}
            <button
              type="button"
              onClick={() => setActiveView('pipeline')}
              className="w-full h-11 rounded-xl bg-[#faf5e8] hover:bg-[#f3ead3] border border-[#ebd8a8] text-[#745a26] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-2xs"
            >
              <span className="material-symbols-outlined text-[17px]">layers</span>
              <span>Start Batch Analysis (4)</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
