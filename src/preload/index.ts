import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { HotkeyMap, Settings } from '../shared/settings'
import type { HotkeyResult } from '../shared/actions'
import type { BlockWithTask, NewTaskInput, Task } from '../shared/models'
import type { PopupRequest, PopupResult } from '../shared/popup'

// The entire surface the renderer is allowed to touch. Keep this minimal and
// explicit — every addition widens the trust boundary. No raw ipcRenderer, no
// Node APIs, no event emitters leak through.
const api = {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),

  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('settings:update', patch),

  createTask: (input: NewTaskInput): Promise<Task> => ipcRenderer.invoke('tasks:create', input),
  getRecentTasks: (windowDays?: number): Promise<Task[]> =>
    ipcRenderer.invoke('tasks:recent', windowDays),

  // referenceMs selects the day; omit for today.
  getBlocksForDay: (referenceMs?: number): Promise<BlockWithTask[]> =>
    ipcRenderer.invoke('blocks:forDay', referenceMs),

  // Persist a new hotkey map only if every key registers; reports per-key result.
  setHotkeys: (map: HotkeyMap): Promise<{ ok: boolean; results: HotkeyResult[] }> =>
    ipcRenderer.invoke('triggers:set-hotkeys', map),

  // Popup window surface (used only by the popup renderer). The state machine in
  // main shows a mode; the renderer replies with a result (or null to cancel).
  popup: {
    ready: (): void => ipcRenderer.send('popup:ready'),
    onShow: (callback: (request: PopupRequest) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, request: PopupRequest): void => callback(request)
      ipcRenderer.on('popup:show', handler)
      return () => ipcRenderer.removeListener('popup:show', handler)
    },
    respond: (requestId: number, result: PopupResult | null): void =>
      ipcRenderer.send('popup:result', { requestId, result })
  }
}

export type Api = typeof api

// contextIsolation is always on, so expose via the bridge. The else branch
// should never run; it exists only to fail loudly if the security posture
// regresses during development.
if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  throw new Error('contextIsolation is disabled — refusing to expose the IPC bridge unsafely')
}
