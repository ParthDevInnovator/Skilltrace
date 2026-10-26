export function ContextFeedback({ phase, retry }: { phase: string; retry: () => void }) {
  if (phase === 'ready') return null
  if (phase === 'error') return <div role="alert" className="notice error">Evidence could not be loaded. <button onClick={retry}>Retry evidence</button></div>
  if (phase === 'waiting') return <div role="status" className="notice">Context is still building. Automatic polling stopped after 10 attempts. <button onClick={retry}>Retry evidence</button></div>
  return <div role="status" className="context-skeleton">Building candidate context...</div>
}
