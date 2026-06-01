import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SettingsApp } from './settings/SettingsApp'
import './styles.css'
import './settings/settings.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <SettingsApp />
  </StrictMode>
)
