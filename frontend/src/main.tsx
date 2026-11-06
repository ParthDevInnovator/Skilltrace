import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ClerkProvider } from '@clerk/react'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  ?? import.meta.env.CLERK_PUBLISHABLE_KEY

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {publishableKey ? (
      <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/login" appearance={{
        variables: {
          colorPrimary: '#0e1012',
          colorBackground: '#ffffff',
          colorForeground: '#141618',
          colorMutedForeground: '#4d545d',
          colorNeutral: '#141618',
          colorInput: '#ffffff',
          colorInputForeground: '#141618',
          colorRing: '#a4823e',
          borderRadius: '0.75rem',
          fontFamily: 'inherit',
        },
      }}>
        <App />
      </ClerkProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
)
