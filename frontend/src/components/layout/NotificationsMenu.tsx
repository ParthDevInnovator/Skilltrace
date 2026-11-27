import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type AppNotification } from '@/services/api'
import { useJob } from '@/context/JobContext'

export const NOTIFICATION_POLL_MS = 60_000

/** In-app notifications (OI-33): analysis results, access requests and job status changes. */
export function NotificationsMenu() {
  const { jobs, openCandidateDetail, openJobWorkspace, setActiveView } = useJob()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const [unread, setUnread] = useState(0)
  const [error, setError] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  const load = useCallback(async () => {
    try {
      const result = await api.getNotifications()
      setItems(result.items ?? []); setUnread(result.unread_count ?? 0); setError(false)
    } catch { setError(true) }
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let live = true
    const tick = async () => { await load(); if (live) timer = setTimeout(() => void tick(), NOTIFICATION_POLL_MS) }
    void tick()
    return () => { live = false; clearTimeout(timer) }
  }, [load])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!panel.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  async function select(item: AppNotification) {
    setOpen(false)
    if (!item.read_at) {
      setItems(previous => previous?.map(entry => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry) ?? null)
      setUnread(value => Math.max(0, value - 1))
      api.markNotificationRead(item.id).catch(() => void load())
    }
    if (item.candidate_id) openCandidateDetail(item.candidate_id)
    else if (item.job_id) { const job = jobs.find(entry => entry.id === item.job_id); if (job) openJobWorkspace(job); else setActiveView('jobs') }
    else if (item.kind === 'membership_request') setActiveView('admin-access')
  }
  async function readAll() {
    try { await api.markAllNotificationsRead(); await load() } catch { setError(true) }
  }

  return <div className="notifications-menu relative">
    <button ref={button} type="button" aria-expanded={open} aria-haspopup="true"
      aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      onClick={() => { setOpen(value => !value); if (!open) void load() }}
      className="relative w-9 h-9 rounded-lg border border-[#e7e2d9] bg-white hover:bg-[#f8f7f4] text-[#59616b] hover:text-[#141618] flex items-center justify-center transition-colors shadow-2xs">
      <span aria-hidden="true" className="material-symbols-outlined text-[19px]">notifications</span>
      {unread > 0 && <span aria-hidden="true" className="notifications-count">{unread > 9 ? '9+' : unread}</span>}
    </button>
    {open && <div ref={panel} className="notifications-panel" role="region" aria-label="Notifications"
      onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); button.current?.focus() } }}>
      <div className="notifications-heading"><h2>Notifications</h2>{unread > 0 && <button type="button" onClick={() => void readAll()}>Mark all as read</button>}</div>
      {error && <p role="alert">Could not load notifications. <button type="button" onClick={() => void load()}>Retry</button></p>}
      {items === null && !error ? <p role="status">Loading…</p>
        : items && !items.length ? <p>You're all caught up.</p>
        : <ul>{items?.map(item => <li key={item.id} data-unread={!item.read_at || undefined}>
            <button type="button" onClick={() => void select(item)}>
              <strong>{item.title}</strong>{item.body && <span>{item.body}</span>}
              <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
              {!item.read_at && <span className="sr-only">Unread</span>}
            </button>
          </li>)}</ul>}
    </div>}
  </div>
}
