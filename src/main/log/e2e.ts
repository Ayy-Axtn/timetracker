import { readFileSync, writeFileSync } from 'node:fs'
import { createEndedBlock, getBlockById, getBlocksForRange } from '../db/blocks'
import { createTask } from '../db/tasks'
import { localDayBounds } from '../time'
import { getTodaysLogWindowForTest, notifyBlocksChanged, showTodaysLogWindow } from '../windows'

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

  // Let the renderer reflect the edit (its reload is a separate round-trip)
  // before driving the next operation.
  await waitFor(`${sel(`summary-${aBlock.id}`)}.textContent === 'reviewed'`)

  // Split Alpha (09:00–10:00) at 09:45 via the inline time control...
  await clickTestid(`split-${aBlock.id}`)
  if (!(await waitFor(sel(`split-time-${aBlock.id}`)))) throw new Error('split control never rendered')
  await setValue(`split-time-${aBlock.id}`, '09:45')
  await clickTestid(`split-confirm-${aBlock.id}`)
  check('split cuts the block at the chosen time', await waitUntil(() => getBlockById(aBlock.id)?.endTime === atToday(9, 45)))
  const today0 = localDayBounds(Date.now())
  const half = getBlocksForRange(today0.start, today0.end).find(
    (b) => b.taskId === alpha.id && b.startTime === atToday(9, 45)
  )
  check('split creates the second half', !!half && half.endTime === atToday(10, 0))

  // ...then merge the two halves back together (adjacent, same task, both ended).
  if (half) {
    await waitFor(sel(`mergeup-${half.id}`))
    await clickTestid(`mergeup-${half.id}`)
    check(
      'merge recombines the halves',
      await waitUntil(() => getBlockById(half.id) === undefined && getBlockById(aBlock.id)?.endTime === atToday(10, 0))
    )
  }

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

  // Live update: a change reported by the main process (as the state machine
  // does after a transition) refreshes the open window without a manual reload.
  const live = createTask({ name: 'Live' }, atToday(11, 0))
  createEndedBlock({ taskId: live.id, startTime: atToday(11, 0), endTime: atToday(11, 30), summary: null })
  notifyBlocksChanged()
  check('open log refetches on a reported change', await waitFor(`document.querySelectorAll('[data-testid="log-row"]').length === 3`))

  // Export day writes a CSV (TIMETRACKER_EXPORT_PATH points it at a temp file
  // instead of opening the save dialog).
  const exportPath = process.env['TIMETRACKER_EXPORT_PATH']
  await clickTestid('export-day')
  check(
    'export day writes the day CSV',
    !!exportPath &&
      (await waitUntil(() => {
        try {
          const csv = readFileSync(exportPath, 'utf-8')
          return csv.startsWith('Date,Start,End,Hours') && csv.includes('Alpha')
        } catch {
          return false
        }
      }))
  )

  // Inline-edit Alpha's start time (09:00 → 08:30) via the clickable clock cell.
  await clickTestid(`start-${aBlock.id}`)
  if (!(await waitFor(sel(`start-${aBlock.id}-input`)))) throw new Error('start editor never rendered')
  await setValue(`start-${aBlock.id}-input`, '08:30')
  await keydown(`start-${aBlock.id}-input`, 'Enter')
  check('inline start-time edit persists to the DB', await waitUntil(() => getBlockById(aBlock.id)?.startTime === atToday(8, 30)))

  // An end before the start is rejected: the value is unchanged and an error shows.
  await clickTestid(`end-${aBlock.id}`)
  if (!(await waitFor(sel(`end-${aBlock.id}-input`)))) throw new Error('end editor never rendered')
  await setValue(`end-${aBlock.id}-input`, '07:00')
  await keydown(`end-${aBlock.id}-input`, 'Enter')
  check('invalid end (before start) is rejected', await waitFor(sel('edit-error')))
  check('rejected edit leaves the end unchanged', getBlockById(aBlock.id)?.endTime === atToday(10, 0))

  // Multi-line notes: line breaks survive in the log (display + textarea edit).
  const noted = createTask({ name: 'Noted', notes: 'first line\nsecond line' }, atToday(12, 0))
  const notedBlock = createEndedBlock({ taskId: noted.id, startTime: atToday(12, 0), endTime: atToday(12, 30), summary: null })
  notifyBlocksChanged()
  await waitFor(sel(`notes-${notedBlock.id}`))
  check(
    'multi-line notes preserve line breaks in display',
    await exec<boolean>(`getComputedStyle(${sel(`notes-${notedBlock.id}`)}).whiteSpace.startsWith('pre')`)
  )
  await clickTestid(`notes-${notedBlock.id}`)
  check(
    'editing multi-line notes opens a textarea',
    await waitFor(`${sel(`notes-${notedBlock.id}-input`)} && ${sel(`notes-${notedBlock.id}-input`)}.tagName === 'TEXTAREA'`)
  )
}
