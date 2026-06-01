import { join } from 'node:path'
import { BrowserWindow } from 'electron'

// Load a renderer entry from the Vite dev server when running `electron-vite
// dev`, otherwise from the built file. ELECTRON_RENDERER_URL is set by
// electron-vite; 'index' is the Today's Log entry, 'settings' the settings one.
const loadRenderer = (window: BrowserWindow, entry: 'index' | 'settings'): void => {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void window.loadURL(entry === 'index' ? devUrl : `${devUrl}/${entry}.html`)
  } else {
    void window.loadFile(join(__dirname, `../renderer/${entry}.html`))
  }
}

// Locked-down defaults shared by every renderer window. The renderer stays
// sandboxed with context isolation and no Node integration; all privileged work
// happens in the main process and is reached only over the preload IPC surface.
const secureWebPreferences = {
  preload: join(__dirname, '../preload/index.js'),
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false
}

let todaysLogWindow: BrowserWindow | null = null

const createTodaysLogWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 960,
    height: 640,
    show: false,
    autoHideMenuBar: true,
    title: "Today's Log",
    webPreferences: secureWebPreferences
  })

  window.on('ready-to-show', () => window.show())
  window.on('closed', () => {
    todaysLogWindow = null
  })

  loadRenderer(window, 'index')
  return window
}

/** Test-only accessor for the Today's Log E2E driver. */
export const getTodaysLogWindowForTest = (): BrowserWindow | null => todaysLogWindow

/**
 * Tell the Today's Log window (if open) that block data changed, so it refetches
 * the day it is viewing. Sent after every state-machine transition and editor
 * mutation — that's how the log stays live while you start/pause/resume tasks.
 */
export const notifyBlocksChanged = (): void => {
  if (todaysLogWindow && !todaysLogWindow.isDestroyed()) {
    todaysLogWindow.webContents.send('blocks:changed')
  }
}

// Open (creating if needed) and focus the Today's Log window. Used by the tray
// and — once a second instance launches — by the single-instance handler.
export const showTodaysLogWindow = (): void => {
  if (!todaysLogWindow || todaysLogWindow.isDestroyed()) {
    todaysLogWindow = createTodaysLogWindow()
  }
  if (todaysLogWindow.isMinimized()) todaysLogWindow.restore()
  todaysLogWindow.show()
  todaysLogWindow.focus()
}

let settingsWindow: BrowserWindow | null = null

const createSettingsWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 480,
    height: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'TimeTracker Settings',
    webPreferences: secureWebPreferences
  })

  window.on('ready-to-show', () => window.show())
  window.on('closed', () => {
    settingsWindow = null
  })

  loadRenderer(window, 'settings')
  return window
}

/** Test-only accessor for the settings E2E driver. */
export const getSettingsWindowForTest = (): BrowserWindow | null => settingsWindow

export const showSettingsWindow = (): void => {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    settingsWindow = createSettingsWindow()
  }
  if (settingsWindow.isMinimized()) settingsWindow.restore()
  settingsWindow.show()
  settingsWindow.focus()
}
