export function ContextFeedback({ phase, retry, message }: { phase: string; retry: () => void; message?: string }) {
  if (phase === 'ready') return null
  if (phase === 'failed') return <div role="alert" className="notice error">Candidate analysis failed{message ? `: ${message}` : '.'} <button onClick={retry}>Retry analysis</button></div>
  if (phase === 'error') return <div role="alert" className="notice error">Evidence could not be loaded. <button onClick={retry}>Retry evidence</button></div>
  if (phase === 'waiting') return <div role="status" className="notice">Context is still building. Automatic polling stopped after 10 attempts. <button onClick={retry}>Retry evidence</button></div>
  return <div role="status" className="context-skeleton">Building candidate context...</div>
}
