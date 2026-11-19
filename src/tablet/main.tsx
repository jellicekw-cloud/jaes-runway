import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import TabletApp from './TabletApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TabletApp />
  </StrictMode>,
)

// Lets the tablet page open with no internet (it keeps a copy of itself). Only for /tablet/.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/tablet/sw.js', { scope: '/tablet/' }).catch(() => { /* still works online */ }) })
}
