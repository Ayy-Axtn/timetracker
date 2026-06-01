import { app } from 'electron'
import { loadSettings } from './settings'
import { registerIpcHandlers } from './ipc'
import { createTray, destroyTray } from './tray'
import { hardenWebContents, installContentSecurityPolicy } from './security'
import { showTodaysLogWindow } from './windows'
import { closeDatabase, initDatabase } from './db/connection'
import { runSelfTest } from './db/selftest'

// Pin the app/userData name so it matches the %APPDATA%\TimeTracker\ convention.
app.setName('TimeTracker')
app.setAppUserModelId('com.timetracker.app')

// Single-instance lock is load-bearing: it guarantees the "at most one active
// block" invariant lives in one process, and (from step 3) it is the entry
// point for timetracker:// protocol activation of the already-running app.
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  // Fired in the primary instance when a second launch occurs. Step 3 parses the
  // protocol URL from argv here; for now a second launch just surfaces the app.
  app.on('second-instance', () => {
    showTodaysLogWindow()
  })

  app.whenReady().then(() => {
    // Dev-only DB self-test, guarded by env var (npm run db:selftest). Runs
    // against an in-memory database and exits without showing any UI.
    if (process.env['TIMETRACKER_SELFTEST']) {
      app.exit(runSelfTest() ? 0 : 1)
      return
    }

    loadSettings()
    initDatabase()
    installContentSecurityPolicy()
    hardenWebContents()
    registerIpcHandlers()
    createTray()
    // Tray-first app; for the scaffold we open the log window once so launch is
    // visible. Later steps may leave the app idle in the tray until triggered.
    showTodaysLogWindow()
  })

  // This is a tray app: closing the last window must not quit it. The app exits
  // only via the tray's Quit item (or OS shutdown).
  app.on('window-all-closed', () => {
    // Intentionally left as a no-op on Windows — the tray keeps the app alive.
  })

  app.on('before-quit', () => {
    destroyTray()
    closeDatabase()
  })
}
