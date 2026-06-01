import { app, ipcMain } from 'electron'
import type { Settings } from '../shared/settings'
import { getSettings, updateSettings } from './settings'

// Minimal placeholder IPC surface for the scaffold. Channels are added here as
// each later step needs them; the renderer only ever sees what preload exposes.
// Every handler uses ipcMain.handle (request/response) — no fire-and-forget yet.
export const registerIpcHandlers = (): void => {
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('settings:get', (): Settings => getSettings())
  ipcMain.handle('settings:update', (_event, patch: Partial<Settings>): Settings =>
    updateSettings(patch)
  )
}
