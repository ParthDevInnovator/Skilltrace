import { useSyncExternalStore } from 'react'
import { api, ApiError } from '@/services/api'

/**
 * The batch resume queue. It lives outside React so the queue, its results and accepted
 * uploads that are still being analyzed survive navigating away from Add Candidates (OI-26).
 *
 * Each entry has its own ID, so two files with the same name are tracked separately and a
 * removed file never passes its status to a new one (OI-25). An upload is only "Analyzed" once
 * the candidate's context is ready; HTTP 202 means accepted, nothing more (OI-24).
 */
export type EntryPhase =
  | 'queued' | 'invalid' | 'uploading' | 'rejected' | 'needs_identity' | 'failed'
  | 'analyzing' | 'analyzed' | 'analysis_failed' | 'analysis_slow'
export type IdentityField = 'full_name' | 'email'
export interface BatchEntry {
  id: string
  file: File
  phase: EntryPhase
  message: string
  candidateId?: string
  revision?: string
  field?: IdentityField
  corrections: Record<IdentityField, string>
}

export const ANALYSIS_POLL_MS = 4000
export const ANALYSIS_POLL_LIMIT = 30
const MAX_BYTES = 5 * 1024 * 1024
const UPLOADABLE: EntryPhase[] = ['queued', 'failed', 'needs_identity']

let entries: BatchEntry[] = []
let running = false
let nextId = 0
const listeners = new Set<() => void>()
const polls = new Map<string, ReturnType<typeof setTimeout>>()

function emit() { for (const listener of listeners) listener() }
function update(id: string, patch: Partial<BatchEntry>) {
  entries = entries.map(entry => entry.id === id ? { ...entry, ...patch } : entry)
  emit()
}
const find = (id: string) => entries.find(entry => entry.id === id)
const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified

function validate(file: File) {
  if (!/\.(pdf|docx|txt)$/i.test(file.name)) return 'Choose a PDF, DOCX or TXT file.'
  if (!file.size) return 'This file is empty.'
  if (file.size > MAX_BYTES) return 'Resume files must be 5 MB or smaller.'
  return ''
}

export function addFiles(files: Iterable<File>) {
  const added: BatchEntry[] = []
  for (const file of files) {
    // Skip only the exact same file; a different file that shares a name gets its own entry.
    if ([...entries, ...added].some(entry => sameFile(entry.file, file))) continue
    const problem = validate(file)
    added.push({ id: `batch-${++nextId}`, file, phase: problem ? 'invalid' : 'queued', message: problem, corrections: { full_name: '', email: '' } })
  }
  if (added.length) { entries = [...entries, ...added]; emit() }
}

export function removeEntry(id: string) {
  clearTimeout(polls.get(id)); polls.delete(id)
  entries = entries.filter(entry => entry.id !== id)
  emit()
}

export function setCorrection(id: string, field: IdentityField, value: string) {
  const entry = find(id)
  if (entry) update(id, { corrections: { ...entry.corrections, [field]: value } })
}

function pollAnalysis(id: string, calls = 0) {
  const entry = find(id)
  if (!entry?.candidateId) return
  const candidateId = entry.candidateId
  api.getCandidateContext(candidateId).then(result => {
    if (find(id)?.candidateId !== candidateId) return
    if (!('status' in result)) { polls.delete(id); update(id, { phase: 'analyzed', message: '' }); return }
    schedule(id, calls + 1)
  }).catch(error => {
    if (find(id)?.candidateId !== candidateId) return
    if (error instanceof ApiError && error.status === 503) { polls.delete(id); update(id, { phase: 'analysis_failed', message: error.detail ?? 'Analysis failed.' }); return }
    schedule(id, calls + 1) // a network blip is not an analysis failure
  })
}
function schedule(id: string, calls: number) {
  if (calls >= ANALYSIS_POLL_LIMIT) { polls.delete(id); update(id, { phase: 'analysis_slow', message: 'Analysis is taking longer than expected.' }); return }
  polls.set(id, setTimeout(() => pollAnalysis(id, calls), ANALYSIS_POLL_MS))
}

/** Start polling an accepted upload again (after a slow analysis or a rebuild). */
export function checkAnalysis(id: string) {
  const entry = find(id)
  if (!entry?.candidateId) return
  clearTimeout(polls.get(id))
  update(id, { phase: 'analyzing', message: '' })
  pollAnalysis(id)
}

async function uploadOne(entry: BatchEntry) {
  if (entry.phase === 'needs_identity' && entry.field && !entry.corrections[entry.field].trim()) return
  update(entry.id, { phase: 'uploading', message: '' })
  const data = new FormData()
  data.append('file', entry.file)
  for (const [field, value] of Object.entries(entry.corrections)) if (value.trim()) data.append(field, value.trim())
  try {
    const result = await api.uploadResume(data)
    if (!find(entry.id)) return
    update(entry.id, { phase: 'analyzing', candidateId: result.candidate_id, revision: result.context_revision, field: undefined })
    pollAnalysis(entry.id)
  } catch (error) {
    if (!find(entry.id)) return
    if (error instanceof ApiError && error.code === 'missing_identity') {
      update(entry.id, { phase: 'needs_identity', field: error.field === 'full_name' ? 'full_name' : 'email', message: error.detail ?? 'Candidate identity is missing.' })
    } else if (error instanceof ApiError && (error.status === 422 || error.status === 413)) {
      // Input the server will reject again as is; the file must be fixed or the identity corrected.
      const identity = error.code === 'invalid_identity'
      update(entry.id, { phase: identity ? 'needs_identity' : 'rejected', field: identity ? 'email' : undefined, message: error.detail ?? 'The resume was rejected.' })
    } else {
      update(entry.id, { phase: 'failed', message: error instanceof ApiError && error.detail ? error.detail : 'Upload failed. Check your connection and retry.' })
    }
  }
}

export async function uploadAll() {
  if (running) return
  running = true; emit()
  try {
    for (const entry of entries.filter(item => UPLOADABLE.includes(item.phase))) {
      const current = find(entry.id)
      if (current && UPLOADABLE.includes(current.phase)) await uploadOne(current)
    }
  } finally { running = false; emit() }
}

export function uploadEntry(id: string) {
  const entry = find(id)
  if (entry && UPLOADABLE.includes(entry.phase)) void uploadOne(entry)
}

/** Test helper: clear the queue and timers. */
export function resetBatchQueue() {
  for (const timer of polls.values()) clearTimeout(timer)
  polls.clear(); entries = []; running = false; nextId = 0; emit()
}

let snapshot = { entries, running }
function getSnapshot() {
  if (snapshot.entries !== entries || snapshot.running !== running) snapshot = { entries, running }
  return snapshot
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function useBatchQueue() { return useSyncExternalStore(subscribe, getSnapshot) }
