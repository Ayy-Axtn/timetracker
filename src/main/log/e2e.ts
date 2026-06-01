import { writeFileSync } from 'node:fs'
import { clipboard } from 'electron'
import { createEndedBlock, getBlockById, getBlocksForRange } from '../db/blocks'
import { createTask } from '../db/tasks'
import { localDayBounds } from '../time'
import { formatClipboardLine } from '../../shared/format'
import { getTodaysLogWindowForTest, showTodaysLogWindow } from '../windows'

// Drives the real Today's Log window via executeJavaScript to verify the
// renderer↔IPC↔DB round-trip: inline edit persists, delete persists, copy
// produces the Autotask line, back-date adds a block, and totals reflect it.
// Guarded by TIMETRACKER_LOG_E2E (with TIMETRACKER_DB_PATH pointing at a temp DB).

const checks: { label: string; ok: boolean }[] = []
const check = (label: string, ok: boolean): void => {
  checks.push({ label, ok })
}

const wc = () => {
  const win = getTodaysLogWindowForTest()
  if (!win) throw new Error('log window missing')
  return win.webContents
}
const exec = <T = unknown>(js: string): Promise<T> => wc().executeJavaScript(js, true) as Promise<T>
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

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

const sel = (testid: string): string => `document.querySelector('[data-testid="${testid}"]')`
const rowCount = (): Promise<number> => exec<number>(`document.querySelectorAll('[data-testid="log-row"]').length`)
const clickTestid = (testid: string): Promise<unknown> => exec(`${sel(testid)}.click()`)
const keydown = (testid: string, key: string): Promise<unknown> =>
  exec(`${sel(testid)}.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }))`)
const setValue = async (testid: string, value: string): Promise<void> => {
  await exec(`(() => {
    const el = ${sel(testid)};
    const proto = el.type === 'time' ? HTMLInputElement.prototype : (el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype);
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await waitFor(`${sel(testid)}.value === ${JSON.stringify(value)}`)
}

const report = (result: { ok: boolean; checks: typeof checks; error?: string }): void => {
  const out = process.env['TIMETRACKER_LOG_E2E_OUT']
  if (out) writeFileSync(out, JSON.stringify(result, null, 2), 'utf-8')
  else for (const c of result.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}`)
}

const atToday = (h: number, m: number): number => {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

export const runLogE2E = async (): Promise<boolean> => {
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
  // Seed two blocks for today, then open the log window.
  const alpha = createTask({ name: 'Alpha', ticketId: 'A-1' }, atToday(8, 0))
  const beta = createTask({ name: 'Beta' }, atToday(8, 0))
  const aBlock = createEndedBlock({ taskId: alpha.id, startTime: atToday(9, 0), endTime: atToday(10, 0), summary: null })
  const bBlock = createEndedBlock({ taskId: beta.id, startTime: atToday(10, 0), endTime: atToday(10, 30), summary: 'init' })

  showTodaysLogWindow()
  if (!(await waitFor(`document.querySelectorAll('[data-testid="log-row"]').length === 2`))) {
    throw new Error('log rows never rendered')
  }
  check('renders a row per block', (await rowCount()) === 2)

  // Inline-edit Alpha's summary.
  await clickTestid(`summary-${aBlock.id}`)
  await waitFor(`${sel(`summary-${aBlock.id}-input`)}`)
  await setValue(`summary-${aBlock.id}-input`, 'reviewed')
  await keydown(`summary-${aBlock.id}-input`, 'Enter')
  check('inline summary edit persists to the DB', await waitUntil(() => getBlockById(aBlock.id)?.summary === 'reviewed'))

  // Copy Alpha as an Autotask line. Wait for the renderer to reflect the edit
  // first (its reload is a separate round-trip from the DB write).
  await waitFor(`${sel(`summary-${aBlock.id}`)}.textContent === 'reviewed'`)
  clipboard.writeText('')
  await clickTestid(`copy-${aBlock.id}`)
  const expectedLine = formatClipboardLine({ durationMs: 60 * 60_000, ticketId: 'A-1', text: 'reviewed' })
  check('copy produces the Autotask line', await waitUntil(() => clipboard.readText() === expectedLine))

  // Delete Beta.
  await clickTestid(`delete-${bBlock.id}`)
  check('delete removes the block from the DB', await waitUntil(() => getBlockById(bBlock.id) === undefined))
  check('delete removes the row', await waitFor(`document.querySelectorAll('[data-testid="log-row"]').length === 1`))

  // Back-date a new block (default 09:00–10:00 today).
  await clickTestid('add-block')
  await waitFor(sel('backdate-name'))
  await setValue('backdate-name', 'Gamma')
  await clickTestid('backdate-submit')
  const today = localDayBounds(Date.now())
  check(
    'back-date adds a block to the day',
    await waitUntil(() => getBlocksForRange(today.start, today.end).some((b) => b.taskName === 'Gamma'))
  )
  check('back-date shows a new row', await waitFor(`document.querySelectorAll('[data-testid="log-row"]').length === 2`))

  // Totals: Alpha (1h) + Gamma (1h) = 2h.
  check('total reflects the remaining blocks', await waitFor(`${sel('total-tracked')}.textContent === '2h'`))
}
