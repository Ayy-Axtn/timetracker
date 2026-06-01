import { app } from 'electron'
import type { Settings } from '../shared/settings'
import { getSettings, updateSettings } from './settings'
import { registerProtocol, removeProtocol } from './triggers/protocol'
import { applyHotkeys } from './triggers/hotkeys'

// Bridges persisted settings to their OS-level side effects: launch-at-startup,
// protocol registration, and hotkey registration. Kept out of settings.ts so
// that module stays a pure persistence layer.

export const applyLaunchAtStartup = (enabled: boolean): void => {
  // Never register the dev build to run at login — only the packaged app.
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: enabled })
}

/** Sync every OS-level side effect to the persisted settings (called on launch). */
export const applyStartupSideEffects = (): void => {
  const settings = getSettings()
  applyLaunchAtStartup(settings.launchAtStartup)
  if (settings.triggers.protocolEnabled) registerProtocol()
  else removeProtocol()
  applyHotkeys()
}

/**
 * Persist a settings patch and apply only the side effects whose values
 * actually changed (so toggling, e.g., the popup position doesn't needlessly
 * re-register hotkeys). The hotkey *map* is changed separately via updateHotkeys
 * (validate-before-persist).
 */
export const applySettings = (patch: Partial<Settings>): Settings => {
  const before = getSettings()
  const after = updateSettings(patch)

  if (before.launchAtStartup !== after.launchAtStartup) {
    applyLaunchAtStartup(after.launchAtStartup)
  }
  if (before.triggers.protocolEnabled !== after.triggers.protocolEnabled) {
    if (after.triggers.protocolEnabled) registerProtocol()
    else removeProtocol()
  }
  if (before.triggers.hotkeysEnabled !== after.triggers.hotkeysEnabled) {
    applyHotkeys()
  }
  return after
}
