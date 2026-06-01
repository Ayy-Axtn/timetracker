import { writeFileSync } from 'node:fs'
import { globalShortcut } from 'electron'
import { DEFAULT_SETTINGS, type HotkeyMap } from '../../shared/settings'
import { getSettings } from '../settings'
import {
  findProtocolUrl,
  isProtocolRegistered,
  parseProtocolUrl,
  registerProtocol,
  removeProtocol
} from './protocol'
import { updateHotkeys, validateAccelerator } from './hotkeys'

// Verifies the trigger layer in the real Electron runtime (globalShortcut and
// protocol-client APIs only work in the actual app process). Run via
// `npm run triggers:selftest`. Guarded by TIMETRACKER_TRIGGER_SELFTEST in
// index.ts; results are written to a file (GUI-subsystem stdout is unreliable).

const checks: { label: string; ok: boolean }[] = []
const check = (label: string, ok: boolean): void => {
  checks.push({ label, ok })
}

const report = (result: { ok: boolean; checks: typeof checks; error?: string }): void => {
  const out = process.env['TIMETRACKER_TRIGGER_SELFTEST_OUT']
  if (out) writeFileSync(out, JSON.stringify(result, null, 2), 'utf-8')
  else for (const c of result.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}`)
}

export const runTriggerSelfTest = (): boolean => {
  try {
    return execute()
  } catch (err) {
    report({ ok: false, checks, error: err instanceof Error ? (err.stack ?? err.message) : String(err) })
    return false
  } finally {
    globalShortcut.unregisterAll()
  }
}

const execute = (): boolean => {
  // --- Protocol parsing: the untrusted-input allow-list. ---
  check("parses '//newtask'", parseProtocolUrl('timetracker://newtask') === 'newtask')
  check('ignores path + query', parseProtocolUrl('timetracker://endtask/x/y?z=1') === 'endtask')
  check('case-insensitive', parseProtocolUrl('timetracker://NEWTASK') === 'newtask')
  check('opaque form (no //)', parseProtocolUrl('timetracker:pausetask') === 'pausetask')
  check('resolves resumetask', parseProtocolUrl('timetracker://resumetask') === 'resumetask')
  check('rejects unknown action', parseProtocolUrl('timetracker://bogus') === null)
  check('rejects wrong scheme', parseProtocolUrl('http://newtask') === null)
  check('rejects javascript: scheme', parseProtocolUrl('javascript:alert(1)') === null)
  check('rejects unparseable input', parseProtocolUrl('not a url') === null)
  check('rejects empty token', parseProtocolUrl('timetracker://') === null)
  // Path-traversal in the URL is simply never read — the action token wins.
  check('ignores path traversal', parseProtocolUrl('timetracker://newtask/../../etc/passwd') === 'newtask')

  // --- argv extraction (how Windows delivers the URL). ---
  check('finds url in argv', findProtocolUrl(['electron.exe', '.', 'timetracker://endtask']) === 'timetracker://endtask')
  check('no url in argv', findProtocolUrl(['electron.exe', '.', '--flag']) === null)
  check('finds url case-insensitively', findProtocolUrl(['x', 'TimeTracker://NewTask']) === 'TimeTracker://NewTask')

  // --- Global hotkeys: per-key success and failure detection. ---
  globalShortcut.unregisterAll()
  const okF13 = globalShortcut.register('F13', () => {})
  check('registers F13', okF13)
  check('double-register fails (per-key failure detectable)', globalShortcut.register('F13', () => {}) === false)
  globalShortcut.unregisterAll()

  check('validateAccelerator accepts F14', validateAccelerator('F14') === true)
  check('validateAccelerator rejects malformed', validateAccelerator('Not+A+Real+Key!!') === false)
  check('validate leaves no registration', globalShortcut.isRegistered('F14') === false)

  // --- Validate-before-persist: an unregisterable map must not be saved. ---
  const before = JSON.stringify(getSettings().triggers.hotkeys)
  const badMap: HotkeyMap = { ...DEFAULT_SETTINGS.triggers.hotkeys, newTask: 'Not+A+Real+Key!!' }
  const result = updateHotkeys(badMap)
  check('updateHotkeys rejects bad map', result.ok === false)
  check('bad map not persisted', JSON.stringify(getSettings().triggers.hotkeys) === before)
  globalShortcut.unregisterAll()

  // --- Protocol registration round-trips (restore prior state). ---
  const wasRegistered = isProtocolRegistered()
  check('registerProtocol succeeds', registerProtocol() === true)
  check('isProtocolRegistered after register', isProtocolRegistered() === true)
  if (!wasRegistered) removeProtocol()

  const ok = checks.every((c) => c.ok)
  report({ ok, checks })
  return ok
}
