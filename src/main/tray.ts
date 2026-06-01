import { app, Menu, nativeImage, Tray } from 'electron'
import { showTodaysLogWindow } from './windows'
import trayIdle from '../../resources/tray-idle.png?asset'
import trayActive from '../../resources/tray-active.png?asset'
import trayPaused from '../../resources/tray-paused.png?asset'
import trayError from '../../resources/tray-error.png?asset'

// Icon per tray state. Wired up fully in step 7; for now everything sits idle.
export type TrayState = 'idle' | 'active' | 'paused' | 'error'

const icons: Record<TrayState, string> = {
  idle: trayIdle,
  active: trayActive,
  paused: trayPaused,
  error: trayError
}

let tray: Tray | null = null

const buildMenu = (): Menu =>
  Menu.buildFromTemplate([
    { label: "Open Today's Log", click: () => showTodaysLogWindow() },
    { type: 'separator' },
    // Enabled and wired to the state machine in step 4.
    { label: 'Pause Task', enabled: false },
    { label: 'Resume Task', enabled: false },
    { type: 'separator' },
    // Settings window arrives in step 7.
    { label: 'Settings', enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])

export const createTray = (): void => {
  tray = new Tray(nativeImage.createFromPath(icons.idle))
  tray.setToolTip('TimeTracker')
  // Left-click opens Today's Log; right-click shows the menu (Windows default).
  tray.on('click', () => showTodaysLogWindow())
  tray.setContextMenu(buildMenu())
}

export const setTrayState = (state: TrayState): void => {
  tray?.setImage(nativeImage.createFromPath(icons[state]))
}

export const destroyTray = (): void => {
  tray?.destroy()
  tray = null
}
