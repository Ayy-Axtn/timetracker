import { writeFileSync } from 'node:fs'
import { getSettings } from '../settings'
import { getSettingsWindowForTest, showSettingsWindow } from '../windows'

// Drives the real settings window to verify each control persists (and that the
// hotkey map honours validate-before-persist). Guarded by TIMETRACKER_SETTINGS_E2E
// with TIMETRACKER_SETTINGS_PATH pointing at a throwaway settings file.

const checks: { label: string; ok: boolean }[] = []
const check = (label: string, ok: boolean): void => {
  checks.push({ label, ok })
}

const wc = () => {
  const win = getSettingsWindowForTest()
  if (!win) throw new Error('settings window missing')
  return win.webContents
}
const exec = <T = unknown>(js: string): Promise<T> => wc().executeJavaScript(js, true) as Promise<T>
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const sel = (testid: string): string => `document.querySelector('[data-testid="${testid}"]')`
const waitFor = async (expr: string, ms = 6000): Promise<boolean> => {
  const start = Date.now()
  while (Date.now() - start < ms) {
    try {
      if (await exec<boolean>(`!!(${expr})`)) return true
    } catch {
      /* mid-update */
    }
    await delay(50)
  }
  return false
}
const waitUntil = async (predicate: () => boolean, ms = 6000): Promise<boolean> => {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (predicate()) return true
    await delay(50)
  }
  return predicate()
}

const clickTestid = (testid: string): Promise<unknown> => exec(`${sel(testid)}.click()`)
const setInputValue = async (testid: string, value: string): Promise<void> => {
  await exec(`(() => {
    const el = ${sel(testid)};
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await waitFor(`${sel(testid)}.value === ${JSON.stringify(value)}`)
}
const setSelectValue = (testid: string, value: string): Promise<unknown> =>
  exec(`(() => {
    const el = ${sel(testid)};
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('change', { bubbles: true }));
  })()`)

const report = (result: { ok: boolean; checks: typeof checks; error?: string }): void => {
  const out = process.env['TIMETRACKER_SETTINGS_E2E_OUT']
  if (out) writeFileSync(out, JSON.stringify(result, null, 2), 'utf-8')
  else for (const c of result.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}`)
}

export const runSettingsE2E = async (): Promise<boolean> => {
  try {
    await execute()
    const ok = checks.every((c) => c.ok)
    report({ ok, checks })
    return ok
  } catch (err) {
    report({ ok: false, checks, error: err instanceof Error ? (err.stack ?? err.message) : String(err) })
    return false
  }
}

const execute = async (): Promise<void> => {
  showSettingsWindow()
  if (!(await waitFor(sel('settings-toasts')))) throw new Error('settings form never rendered')

  // Toggle a simple boolean setting.
  check('starts with toasts on', getSettings().showStateToasts === true)
  await clickTestid('settings-toasts')
  check('toggling toasts persists', await waitUntil(() => getSettings().showStateToasts === false))

  // Change the popup position select.
  await setSelectValue('settings-position', 'activeMonitorCentre')
  check('popup position persists', await waitUntil(() => getSettings().popupPosition === 'activeMonitorCentre'))

  // Toggle launch-at-startup (the OS side effect is dev-skipped; the setting persists).
  await clickTestid('settings-launch')
  check('launch-at-startup persists', await waitUntil(() => getSettings().launchAtStartup === false))

  // Remap a hotkey to a valid accelerator and save.
  await setInputValue('settings-hotkey-newTask', 'F18')
  await clickTestid('settings-hotkeys-save')
  check('valid hotkey remap persists', await waitUntil(() => getSettings().triggers.hotkeys.newTask === 'F18'))
  // Wait for the renderer to settle on the saved value (its post-save reload is
  // async) before typing the next value, so it isn't overwritten by the reload.
  await waitFor(`${sel('settings-hotkey-newTask')}.value === 'F18'`)

  // Remap to an invalid accelerator: validate-before-persist must reject it.
  await setInputValue('settings-hotkey-newTask', 'Not+A+Valid+Key!!')
  await clickTestid('settings-hotkeys-save')
  check(
    'invalid hotkey is rejected and the old one kept',
    await waitUntil(() => getSettings().triggers.hotkeys.newTask === 'F18')
  )
  check(
    'rejection is surfaced in the UI',
    await waitFor(`${sel('settings-hotkey-message')}.textContent.includes('register')`)
  )
}
