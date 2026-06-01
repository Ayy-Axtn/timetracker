import { appendFileSync } from 'node:fs'
import { app } from 'electron'
import { getSettings, loadSettings } from './settings'
import { registerIpcHandlers } from './ipc'
import { createTray, destroyTray } from './tray'
import { hardenWebContents, installContentSecurityPolicy } from './security'
import { showTodaysLogWindow } from './windows'
import { closeDatabase, initDatabase } from './db/connection'
import { runSelfTest } from './db/selftest'
import { findProtocolUrl, registerProtocol } from './triggers/protocol'
import { applyHotkeys, unregisterHotkeys } from './triggers/hotkeys'
import { dispatchAction, handleProtocolActivation } from './triggers/dispatch'
import { runTriggerSelfTest } from './triggers/selftest'
import { runRecovery, shutdownState } from './state/runner'
import { runStateSelfTest } from './state/selftest'

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
  // Fired in the primary instance on a second launch. This is the load-bearing
  // protocol entry point: if the relaunch carries a timetracker:// URL (the
  // Stream Deck firing while the app runs — the normal case), dispatch it;
  // otherwise treat it as a plain relaunch and surface the Today's Log window.
  app.on('second-instance', (_event, argv) => {
    const url = findProtocolUrl(argv)
    if (url) handleProtocolActivation(url, 'protocol')
    else showTodaysLogWindow()
  })

  app.whenReady().then(() => {
    // Dev-only self-tests, guarded by env vars. Each runs without showing UI and
    // exits with a pass/fail code (npm run db:selftest / triggers:selftest).
    if (process.env['TIMETRACKER_SELFTEST']) {
      app.exit(runSelfTest() ? 0 : 1)
      return
    }
    if (process.env['TIMETRACKER_TRIGGER_SELFTEST']) {
      app.exit(runTriggerSelfTest() ? 0 : 1)
      return
    }
    if (process.env['TIMETRACKER_STATE_SELFTEST']) {
      void runStateSelfTest().then((ok) => app.exit(ok ? 0 : 1))
      return
    }

    loadSettings()
    initDatabase()
    installContentSecurityPolicy()
    hardenWebContents()
    registerIpcHandlers()

    const e2eSink = process.env['TIMETRACKER_TRIGGER_E2E']

    // Triggers: protocol is primary, hotkeys are the fallback. Skipped in E2E
    // mode, which exercises only the argv → second-instance dispatch path and
    // must not mutate OS protocol registration or grab global keys.
    if (!e2eSink) {
      if (getSettings().triggers.protocolEnabled) registerProtocol()
      applyHotkeys()
    }

    // Pause/Resume from the tray go through the same dispatcher as the triggers.
    createTray({
      onPause: () => dispatchAction('pausetask', 'tray'),
      onResume: () => dispatchAction('resumetask', 'tray')
    })

    // Reconcile a stranded active block from a crash/quit-while-running. Queued
    // ahead of any user action, and it syncs the tray + heartbeat on completion.
    if (!e2eSink) void runRecovery()

    // Cold start via protocol (app wasn't already running): Windows delivers the
    // URL in argv. Dispatch it; otherwise show the log window (not in E2E).
    const coldStartUrl = findProtocolUrl(process.argv)
    if (coldStartUrl) handleProtocolActivation(coldStartUrl, 'protocol')
    else if (!e2eSink) showTodaysLogWindow()

    // Signal the E2E harness that the lock is held and second-instance dispatch
    // is live, so it can start firing protocol URLs.
    if (e2eSink) appendFileSync(e2eSink, 'ready:primary\n')
  })

  // This is a tray app: closing the last window must not quit it. The app exits
  // only via the tray's Quit item (or OS shutdown).
  app.on('window-all-closed', () => {
    // Intentionally left as a no-op on Windows — the tray keeps the app alive.
  })

  app.on('before-quit', () => {
    shutdownState() // keep an accurate last-alive if a block is still active
    unregisterHotkeys()
    destroyTray()
    closeDatabase()
  })
}
