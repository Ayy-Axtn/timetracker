import { contextBridge, ipcRenderer } from 'electron'
import type { Settings } from '../shared/settings'
import type { BlockWithTask, NewTaskInput, Task } from '../shared/models'

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
    ipcRenderer.invoke('blocks:forDay', referenceMs)
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
