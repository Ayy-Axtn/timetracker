import { globalShortcut } from 'electron'
import { HOTKEY_KEYS, type HotkeyResult, type TriggerAction } from '../../shared/actions'
import type { HotkeyMap } from '../../shared/settings'
import { getSettings, updateSettings } from '../settings'
import { setTrayState } from '../tray'
import { notify } from '../notifications'
import { dispatchAction } from './dispatch'

// Global hotkeys are the FALLBACK trigger (protocol is primary). Registration
// can fail when another app already owns a key, so every key is checked
// individually and failures are surfaced — never dropped silently.

const ACTIONS = Object.keys(HOTKEY_KEYS) as TriggerAction[]

// Register a full map, reporting per-key success. Successful keys are left
// registered; failed ones simply aren't. globalShortcut.register can throw on a
// malformed accelerator, so each call is guarded.
const bind = (map: HotkeyMap): HotkeyResult[] =>
  ACTIONS.map((action) => {
    const key = map[HOTKEY_KEYS[action]]
    let ok = false
    try {
      ok = globalShortcut.register(key, () => dispatchAction(action, 'hotkey'))
    } catch {
      ok = false
    }
    return { action, key, ok }
  })

const surfaceFailures = (results: HotkeyResult[]): void => {
  const failed = results.filter((r) => !r.ok)
  if (failed.length === 0) return
  setTrayState('error')
  const keys = failed.map((f) => f.key).join(', ')
  notify(`Couldn't register hotkey(s): ${keys}. They may be in use by another app.`, 'error')
}

/** Apply the persisted hotkey settings, surfacing any registration failures. */
export const applyHotkeys = (): HotkeyResult[] => {
  globalShortcut.unregisterAll()
  const { triggers } = getSettings()
  if (!triggers.hotkeysEnabled) return []
  const results = bind(triggers.hotkeys)
  surfaceFailures(results)
  return results
}

export const unregisterHotkeys = (): void => globalShortcut.unregisterAll()

/**
 * Validate a new hotkey map by actually registering it, and only persist if
 * every key registers — so a user can never lock themselves out with an
 * unregisterable combination. On any failure, revert to the persisted set.
 */
export const updateHotkeys = (map: HotkeyMap): { ok: boolean; results: HotkeyResult[] } => {
  globalShortcut.unregisterAll()
  const results = bind(map)
  if (results.some((r) => !r.ok)) {
    globalShortcut.unregisterAll()
    applyHotkeys() // restore the previously persisted, working set
    return { ok: false, results }
  }
  const { triggers } = getSettings()
  updateSettings({ triggers: { ...triggers, hotkeysEnabled: true, hotkeys: map } })
  return { ok: true, results }
}

/**
 * Whether a single accelerator can be registered right now. Used to vet an
 * override before committing it. Leaves global state unchanged.
 */
export const validateAccelerator = (accelerator: string): boolean => {
  try {
    if (globalShortcut.isRegistered(accelerator)) return true // we already hold it
    const ok = globalShortcut.register(accelerator, () => {})
    if (ok) globalShortcut.unregister(accelerator)
    return ok
  } catch {
    return false
  }
}
