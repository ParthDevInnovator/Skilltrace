import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@/types'
import { api } from '@/services/api'
import { useJob } from '@/context/JobContext'

type Turn = ChatMessage & { provider?: string; ids?: string[] }
export function ChatDrawer({ onClose, initialMessage = '' }: {onClose:()=>void;initialMessage?:string}) {
  const { selectedJob } = useJob()
  const [messages, setMessages] = useState<Turn[]>([])
  const [input, setInput] = useState(initialMessage)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const mounted = useRef(true)
  const inFlight = useRef(false)
  useEffect(() => {
    mounted.current = true
    const previous = document.activeElement as HTMLElement | null
    const element = dialog.current
    element?.showModal()
    return () => { mounted.current = false; element?.close(); previous?.focus() }
  }, [])
  async function send() {
    const message = input.trim()
    if (!message || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const response = await api.sendChatMessage({message, history:messages.map(({role,content})=>({role,content})), job_id:selectedJob?.id})
      if (!mounted.current) return
      setMessages(previous => [...previous, {role:'user',content:message}, {role:'assistant',content:response.assistant_message,provider:response.provider_used,ids:response.grounding_ids}])
      setInput('')
    } catch { if (mounted.current) setError('AI assistance is unavailable. Please retry.') }
    finally { inFlight.current = false; if (mounted.current) setBusy(false) }
  }
  return <dialog ref={dialog} className="chat-drawer" aria-labelledby="chat-title" onCancel={event=>{event.preventDefault();onClose()}}>
    <div className="page-title"><h2 id="chat-title">Candidate Chat</h2><button onClick={onClose} aria-label="Close chat">Close</button></div>
    <p>Explore candidate evidence. Include a name or email in each question.</p>
    <div className="chat-thread" role="log" aria-label="Conversation" aria-live="polite">
      {messages.map((turn,index)=><article className={`chat-turn ${turn.role}`} key={index}><strong>{turn.role === 'user' ? 'You' : 'Assistant'}</strong><p className="preserve-text">{turn.content}</p>{turn.ids?.map(id=><code className="source-chip" key={id}>{id}</code>)}{turn.provider && <small className="provider-badge">{turn.provider === 'gemini' ? 'Gemini' : 'Groq'}</small>}</article>)}
      {busy && <div role="status" aria-label="Assistant is typing" className="typing-indicator"><span>•</span><span>•</span><span>•</span></div>}
    </div>
    {error && <div role="alert"><p>{error}</p><button onClick={send}>Retry message</button></div>}
    <form onSubmit={event=>{event.preventDefault();void send()}}><label htmlFor="chat-input">Message</label><textarea autoFocus id="chat-input" value={input} disabled={busy} onChange={event=>setInput(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send()}}} /><button className="primary-button" disabled={busy||!input.trim()} type="submit">Send</button></form>
  </dialog>
}
