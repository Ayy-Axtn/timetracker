import { writeFileSync } from 'node:fs'
import type { NewTaskInput } from '../../shared/models'
import type { OpenTaskView } from '../../shared/popup'
import { getPopupWindowForTest, showStatus } from './popup'
import { popupPrompter } from './prompter'

// Drives the real popup DOM via executeJavaScript to verify the keyboard-first
// behaviour and the full main↔renderer round-trip: show a mode, simulate the
// user, and assert the prompter promise resolves with the expected result.
// Guarded by TIMETRACKER_POPUP_E2E; results written to a file.

const checks: { label: string; ok: boolean }[] = []
const check = (label: string, ok: boolean): void => {
  checks.push({ label, ok })
}

const wc = () => {
  const win = getPopupWindowForTest()
  if (!win) throw new Error('popup window missing')
  return win.webContents
}

const exec = <T = unknown>(js: string): Promise<T> => wc().executeJavaScript(js, true) as Promise<T>
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// Poll a JS boolean expression until true (or time out).
const waitFor = async (expr: string, ms = 5000): Promise<boolean> => {
  const start = Date.now()
  while (Date.now() - start < ms) {
    try {
      if (await exec<boolean>(`!!(${expr})`)) return true
    } catch {
      // renderer mid-update; retry
    }
    await delay(50)
  }
  return false
}

const sel = (testid: string): string => `document.querySelector('[data-testid="${testid}"]')`
const waitForMode = (mode: string): Promise<boolean> => waitFor(`document.body.dataset.popupMode === ${JSON.stringify(mode)}`)

// Set a controlled input/textarea's value the way React expects, then wait for
// the re-render so the next keydown handler closes over the new state.
const setValue = async (testid: string, value: string): Promise<void> => {
  await exec(`(() => {
    const el = ${sel(testid)};
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await waitFor(`${sel(testid)}.value === ${JSON.stringify(value)}`)
}

const keydown = (testid: string, key: string): Promise<unknown> =>
  exec(`${sel(testid)}.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }))`)

const clickTestid = (testid: string): Promise<unknown> => exec(`${sel(testid)}.click()`)
const mousedownTestid = (testid: string): Promise<unknown> =>
  exec(`${sel(testid)}.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)

const report = (result: { ok: boolean; checks: typeof checks; error?: string }): void => {
  const out = process.env['TIMETRACKER_POPUP_E2E_OUT']
  if (out) writeFileSync(out, JSON.stringify(result, null, 2), 'utf-8')
  else for (const c of result.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}`)
}

export const runPopupE2E = async (): Promise<boolean> => {
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

const RECENT = [{ id: 1, name: 'Recent A', ticketId: 'R-1', notes: null, createdAt: 0 }]
const OPEN: OpenTaskView[] = [
  { blockId: 11, taskName: 'Alpha', ticketId: 'A-1', state: 'active', startTime: 0 },
  { blockId: 22, taskName: 'Beta', ticketId: null, state: 'paused', startTime: 0 }
]
const PAUSED: OpenTaskView[] = [
  { blockId: 33, taskName: 'Gamma', ticketId: null, state: 'paused', startTime: 0 },
  { blockId: 44, taskName: 'Delta', ticketId: null, state: 'paused', startTime: 0 }
]

const execute = async (): Promise<void> => {
  // New Task: type a name, press Enter.
  {
    const p = popupPrompter.newTaskDetails(RECENT)
    if (!(await waitForMode('newTask'))) throw new Error('newTask never rendered')
    await setValue('newtask-name', 'My Task')
    await keydown('newtask-name', 'Enter')
    const r = (await p) as NewTaskInput | null
    check('newTask: typed name + Enter submits', !!r && r.name === 'My Task' && r.ticketId === null)
  }

  // New Task: ArrowDown to highlight the recent task, Enter to pick it.
  {
    const p = popupPrompter.newTaskDetails(RECENT)
    await waitForMode('newTask')
    await keydown('newtask-name', 'ArrowDown')
    await waitFor(`document.querySelectorAll('[data-testid="recent-list"] li')[0].classList.contains('highlighted')`)
    await keydown('newtask-name', 'Enter')
    const r = (await p) as NewTaskInput | null
    check('newTask: ArrowDown + Enter picks recent task', !!r && r.name === 'Recent A' && r.ticketId === 'R-1')
  }

  // New Task: Esc cancels.
  {
    const p = popupPrompter.newTaskDetails([])
    await waitForMode('newTask')
    await keydown('newtask-name', 'Escape')
    check('newTask: Esc cancels', (await p) === null)
  }

  // Resolve-active: the "e" shortcut chooses End.
  {
    const p = popupPrompter.resolveActiveOnNew('Alpha')
    await waitForMode('resolveActive')
    await keydown('resolve-pause', 'e')
    check('resolveActive: "e" chooses end', (await p) === 'end')
  }

  // End picker: ArrowDown then Enter selects the second open task.
  {
    const p = popupPrompter.pickOpenTask(OPEN)
    await waitForMode('pickOpen')
    await keydown('picker-list', 'ArrowDown')
    await waitFor(`document.querySelectorAll('[data-testid="picker-item"]')[1].classList.contains('highlighted')`)
    await keydown('picker-list', 'Enter')
    check('pickOpen: ArrowDown + Enter selects 2nd task', (await p) === 22)
  }

  // Resume picker: clicking selects the first paused task.
  {
    const p = popupPrompter.pickPausedTask(PAUSED)
    await waitForMode('pickPaused')
    await mousedownTestid('picker-item')
    check('pickPaused: click selects a task', (await p) === 33)
  }

  // End summary: type a note, Enter submits it.
  {
    const p = popupPrompter.endSummary('Alpha')
    await waitForMode('endSummary')
    await setValue('summary-input', 'Wrapped up')
    await keydown('summary-input', 'Enter')
    check('endSummary: text + Enter submits the note', (await p) === 'Wrapped up')
  }

  // End summary: empty Enter is a valid (empty) submit, not a cancel.
  {
    const p = popupPrompter.endSummary('Alpha')
    await waitForMode('endSummary')
    await keydown('summary-input', 'Enter')
    check('endSummary: empty Enter submits empty string', (await p) === '')
  }

  // Crash recovery: choose Discard.
  {
    const p = popupPrompter.crashRecovery('Alpha', null)
    await waitForMode('crashRecovery')
    await clickTestid('recovery-discard')
    check('crashRecovery: discard chosen', (await p) === 'discard')
  }

  // Close button cancels any mode.
  {
    const p = popupPrompter.resolveActiveOnNew('Alpha')
    await waitForMode('resolveActive')
    await clickTestid('popup-close')
    check('close button cancels', (await p) === null)
  }

  // Status quick view: shows the active task, dismisses on Close.
  {
    const p = showStatus({
      active: { blockId: 1, taskName: 'Alpha', ticketId: 'A-1', state: 'active', startTime: 0 },
      paused: [{ blockId: 2, taskName: 'Beta', ticketId: null, state: 'paused', startTime: 0 }]
    })
    if (!(await waitForMode('status'))) throw new Error('status never rendered')
    check('status shows the active task', await waitFor(`${sel('status-active')}.textContent.includes('Alpha')`))
    await clickTestid('status-close')
    check('status closes on Close', await waitFor(`!document.body.dataset.popupMode`))
    await p
  }
}
