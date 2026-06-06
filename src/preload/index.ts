import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { HotkeyMap, Settings } from '../shared/settings'
import type { HotkeyResult } from '../shared/actions'
import type {
  BackdateInput,
  Block,
  BlockPatch,
  BlockWithTask,
  NewTaskInput,
  Task,
  TaskPatch
} from '../shared/models'
import type { PopupRequest, PopupResult } from '../shared/popup'

// The entire surface the renderer is allowed to touch. Keep this minimal and
// explicit — every addition widens the trust boundary. No raw ipcRenderer, no
// Node APIs, no event emitters leak through.
const api = {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),

  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('settings:update', patch),
  // Open the settings window (used by the Today's Log header button).
  openSettings: (): Promise<void> => ipcRenderer.invoke('windows:open-settings'),

  createTask: (input: NewTaskInput): Promise<Task> => ipcRenderer.invoke('tasks:create', input),
  getRecentTasks: (windowDays?: number): Promise<Task[]> =>
    ipcRenderer.invoke('tasks:recent', windowDays),

  // referenceMs selects the day; omit for today.
  getBlocksForDay: (referenceMs?: number): Promise<BlockWithTask[]> =>
    ipcRenderer.invoke('blocks:forDay', referenceMs),

  // Today's Log editor.
  updateTask: (id: number, patch: TaskPatch): Promise<Task | undefined> =>
    ipcRenderer.invoke('tasks:update', id, patch),
  updateBlock: (id: number, patch: BlockPatch): Promise<Block | undefined> =>
    ipcRenderer.invoke('blocks:update', id, patch),
  deleteBlock: (id: number): Promise<boolean> => ipcRenderer.invoke('blocks:delete', id),
  mergeBlocks: (keepId: number, dropId: number): Promise<Block | undefined> =>
    ipcRenderer.invoke('blocks:merge', keepId, dropId),
  splitBlock: (id: number, atMs: number): Promise<{ first: Block; second: Block } | undefined> =>
    ipcRenderer.invoke('blocks:split', id, atMs),
  backdateBlock: (input: BackdateInput): Promise<Block> =>
    ipcRenderer.invoke('blocks:backdate', input),
  exportCsv: (content: string, defaultFileName: string): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke('export:csv', content, defaultFileName),

  // Fires when block data changes (a transition or an edit) so the Today's Log
  // window can refetch the day it is viewing. Returns an unsubscribe function.
  onBlocksChanged: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('blocks:changed', handler)
    return () => ipcRenderer.removeListener('blocks:changed', handler)
  },

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
      ipcRenderer.send('popup:result', { requestId, result }),
    // Ask main to grow the popup window by `grownByPx` (the description field's
    // growth past its initial height); main clamps to the screen.
    resize: (grownByPx: number): void => ipcRenderer.send('popup:resize', grownByPx)
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
