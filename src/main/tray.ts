import { app, Menu, nativeImage, Tray } from 'electron'
import { showTodaysLogWindow } from './windows'
import trayIdle from '../../resources/tray-idle.png?asset'
import trayActive from '../../resources/tray-active.png?asset'
import trayPaused from '../../resources/tray-paused.png?asset'
import trayError from '../../resources/tray-error.png?asset'

// Icon per tray state. Tooltip-with-elapsed and the error-state polish land in
// step 7; here the icon already tracks active/paused/idle as transitions run.
export type TrayState = 'idle' | 'active' | 'paused' | 'error'

export interface TrayMenuState {
  hasActive: boolean
  hasPaused: boolean
}

// Pause/Resume are driven by the state machine; the click handlers are injected
// so the tray doesn't import the dispatcher (which would form a cycle).
export interface TrayCallbacks {
  onPause: () => void
  onResume: () => void
}

const icons: Record<TrayState, string> = {
  idle: trayIdle,
  active: trayActive,
  paused: trayPaused,
  error: trayError
}

let tray: Tray | null = null
let callbacks: TrayCallbacks = { onPause: () => {}, onResume: () => {} }
let menuState: TrayMenuState = { hasActive: false, hasPaused: false }

const buildMenu = (): Menu =>
  Menu.buildFromTemplate([
    { label: "Open Today's Log", click: () => showTodaysLogWindow() },
    { type: 'separator' },
    { label: 'Pause Task', enabled: menuState.hasActive, click: () => callbacks.onPause() },
    { label: 'Resume Task', enabled: menuState.hasPaused, click: () => callbacks.onResume() },
    { type: 'separator' },
    // Settings window arrives in step 7.
    { label: 'Settings', enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])

export const createTray = (cb: TrayCallbacks): void => {
  callbacks = cb
  tray = new Tray(nativeImage.createFromPath(icons.idle))
  tray.setToolTip('TimeTracker')
  // Left-click opens Today's Log; right-click shows the menu (Windows default).
  tray.on('click', () => showTodaysLogWindow())
  tray.setContextMenu(buildMenu())
}

/** Rebuild the menu with current enable flags (Resume only when paused tasks exist). */
export const updateTrayMenu = (state: TrayMenuState): void => {
  menuState = state
  tray?.setContextMenu(buildMenu())
}

export const setTrayState = (state: TrayState): void => {
  tray?.setImage(nativeImage.createFromPath(icons[state]))
}

export const destroyTray = (): void => {
  tray?.destroy()
  tray = null
}
