import { join } from 'node:path'
import { BrowserWindow } from 'electron'

// Load the renderer from the Vite dev server when running `electron-vite dev`,
// otherwise from the built file. ELECTRON_RENDERER_URL is set by electron-vite.
const loadRenderer = (window: BrowserWindow): void => {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void window.loadURL(devUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
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

  loadRenderer(window)
  return window
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
