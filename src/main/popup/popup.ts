import { join } from 'node:path'
import { BrowserWindow, ipcMain, screen } from 'electron'
import type { PopupMode, PopupPayload } from '../../shared/popup'
import { getSettings } from '../settings'

// The single reusable popup window plus the request/response machinery that lets
// the main-process state machine show a mode and await the renderer's reply.
// The window is frameless, always-on-top, hidden between uses, and steals focus
// when shown. Created once at startup; modes are swapped by IPC, not reloads.

const WIDTH = 420
const MODE_HEIGHT: Record<PopupMode, number> = {
  newTask: 392,
  resolveActive: 176,
  pickOpen: 360,
  pickPaused: 360,
  endSummary: 232,
  crashRecovery: 200
}

let win: BrowserWindow | null = null
let readyPromise: Promise<void> | null = null
let allowClose = false
let nextId = 1
const pending = new Map<number, (result: unknown) => void>()

const loadPopup = (window: BrowserWindow): void => {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void window.loadURL(`${devUrl}/popup.html`)
  else void window.loadFile(join(__dirname, '../renderer/popup.html'))
}

const settleAll = (result: unknown): void => {
  for (const [id, resolve] of pending) {
    pending.delete(id)
    resolve(result)
  }
}

// Create the hidden popup window and wire the IPC handlers. Called once at startup.
export const initPopup = (): void => {
  ipcMain.removeAllListeners('popup:ready')
  ipcMain.removeAllListeners('popup:result')

  win = new BrowserWindow({
    width: WIDTH,
    height: MODE_HEIGHT.resolveActive,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // The X button cancels the prompt; closing via the OS (Alt+F4) should also
  // cancel and hide rather than destroy — the window is reused.
  win.on('close', (event) => {
    if (allowClose) return
    event.preventDefault()
    settleAll(null)
    win?.hide()
  })

  let resolveReady: () => void
  readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
  ipcMain.on('popup:ready', () => resolveReady())

  ipcMain.on('popup:result', (_event, payload: { requestId: number; result: unknown }) => {
    const resolve = pending.get(payload.requestId)
    if (!resolve) return
    pending.delete(payload.requestId)
    win?.hide()
    resolve(payload.result)
  })

  loadPopup(win)
}

// Position per the popupPosition setting: centred on the active monitor, or
// anchored at the cursor and clamped to the work area so it never lands
// off-screen near an edge.
const sizeAndPosition = (window: BrowserWindow, mode: PopupMode): void => {
  const height = MODE_HEIGHT[mode]
  const cursor = screen.getCursorScreenPoint()
  const { workArea } = screen.getDisplayNearestPoint(cursor)

  let x: number
  let y: number
  if (getSettings().popupPosition === 'activeMonitorCentre') {
    x = Math.round(workArea.x + (workArea.width - WIDTH) / 2)
    y = Math.round(workArea.y + (workArea.height - height) / 2)
  } else {
    x = Math.min(Math.max(cursor.x, workArea.x), workArea.x + workArea.width - WIDTH)
    y = Math.min(Math.max(cursor.y, workArea.y), workArea.y + workArea.height - height)
  }
  window.setBounds({ x, y, width: WIDTH, height })
}

const waitReady = async (): Promise<boolean> => {
  if (!readyPromise) return false
  const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 8000))
  return (await Promise.race([readyPromise.then(() => 'ready' as const), timeout])) === 'ready'
}

/**
 * Show the popup in `mode` with `payload` and resolve with the renderer's
 * result, or null if cancelled / unavailable. Only one prompt runs at a time
 * (the state-machine queue guarantees this).
 */
export const prompt = async <T>(mode: PopupMode, payload: PopupPayload): Promise<T | null> => {
  if (!win || win.isDestroyed()) return null
  if (!(await waitReady())) return null

  const requestId = nextId++
  const result = new Promise<T | null>((resolve) => {
    pending.set(requestId, (r) => resolve((r ?? null) as T | null))
  })

  sizeAndPosition(win, mode)
  win.show()
  win.focus()
  win.moveTop()
  win.webContents.send('popup:show', { requestId, mode, payload })
  return result
}

export const destroyPopup = (): void => {
  settleAll(null)
  allowClose = true
  win?.destroy()
  win = null
}

/** Test-only accessor for the popup E2E driver. */
export const getPopupWindowForTest = (): BrowserWindow | null => win
