import { app, Menu, nativeImage, Tray } from 'electron'
import { formatDuration } from '../shared/format'
import { showTodaysLogWindow } from './windows'
import trayIdle from '../../resources/tray-idle.png?asset'
import trayActive from '../../resources/tray-active.png?asset'
import trayPaused from '../../resources/tray-paused.png?asset'
import trayError from '../../resources/tray-error.png?asset'

// Icon per tray state: idle (grey), active (green), paused (amber), error (red).
export type TrayState = 'idle' | 'active' | 'paused' | 'error'

export interface TrayMenuState {
  hasActive: boolean
  hasPaused: boolean
}

// Pause/Resume/Settings are driven elsewhere; the click handlers are injected so
// the tray doesn't import the dispatcher/windows logic (which would form a cycle).
export interface TrayCallbacks {
  onPause: () => void
  onResume: () => void
  onSettings: () => void
  onStatus: () => void
}

/** Tooltip text: the running task and its elapsed time when active. */
export const formatTrayTooltip = (state: TrayState, taskName?: string, elapsedMs?: number): string => {
  if (state === 'active' && taskName) return `TimeTracker — ${taskName} (${formatDuration(elapsedMs ?? 0)})`
  if (state === 'paused') return 'TimeTracker — paused'
  if (state === 'error') return 'TimeTracker — trigger error'
  return 'TimeTracker — idle'
}

const icons: Record<TrayState, string> = {
  idle: trayIdle,
  active: trayActive,
  paused: trayPaused,
  error: trayError
}

let tray: Tray | null = null
let callbacks: TrayCallbacks = {
  onPause: () => {},
  onResume: () => {},
  onSettings: () => {},
  onStatus: () => {}
}
let menuState: TrayMenuState = { hasActive: false, hasPaused: false }

const buildMenu = (): Menu =>
  Menu.buildFromTemplate([
    { label: 'Quick view', click: () => callbacks.onStatus() },
    { label: "Open Today's Log", click: () => showTodaysLogWindow() },
    { type: 'separator' },
    { label: 'Pause Task', enabled: menuState.hasActive, click: () => callbacks.onPause() },
    { label: 'Resume Task', enabled: menuState.hasPaused, click: () => callbacks.onResume() },
    { type: 'separator' },
    { label: 'Settings…', click: () => callbacks.onSettings() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])

export const createTray = (cb: TrayCallbacks): void => {
  callbacks = cb
  tray = new Tray(nativeImage.createFromPath(icons.idle))
  tray.setToolTip(formatTrayTooltip('idle'))
  // Left-click opens Today's Log; right-click shows the menu (Windows default).
  tray.on('click', () => showTodaysLogWindow())
  tray.setContextMenu(buildMenu())
}

export const setTrayTooltip = (text: string): void => tray?.setToolTip(text)

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
