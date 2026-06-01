import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PopupApp } from './popup/PopupApp'
import './popup/popup.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>
)
