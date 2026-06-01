import { writeFileSync } from 'node:fs'
import { closeDatabase, initDatabase } from '../db/connection'
import {
  createEndedBlock,
  deleteBlock,
  getBlockById,
  getBlocksForRange,
  mergeBlocks,
  splitBlock,
  updateBlock
} from '../db/blocks'
import { createTask, getTaskById, updateTask } from '../db/tasks'
import { localDayBounds } from '../time'
import { formatClipboardLine, formatDuration } from '../../shared/format'

// Unit tests for the Today's Log editor operations + formatting, against an
// in-memory database. Guarded by TIMETRACKER_LOG_SELFTEST.

const checks: { label: string; ok: boolean }[] = []
const check = (label: string, ok: boolean): void => {
  checks.push({ label, ok })
}
const threw = (fn: () => void): boolean => {
  try {
    fn()
    return false
  } catch {
    return true
  }
}

const report = (result: { ok: boolean; checks: typeof checks; error?: string }): void => {
  const out = process.env['TIMETRACKER_LOG_SELFTEST_OUT']
  if (out) writeFileSync(out, JSON.stringify(result, null, 2), 'utf-8')
  else for (const c of result.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}`)
}

const reset = (): void => {
  closeDatabase()
  initDatabase(':memory:')
}

export const runLogSelfTest = (): boolean => {
  try {
    execute()
    const ok = checks.every((c) => c.ok)
    report({ ok, checks })
    return ok
  } catch (err) {
    report({ ok: false, checks, error: err instanceof Error ? (err.stack ?? err.message) : String(err) })
    return false
  } finally {
    closeDatabase()
  }
}

const execute = (): void => {
  // --- formatting ---
  check('formatDuration 75m → 1h 15m', formatDuration(75 * 60_000) === '1h 15m')
  check('formatDuration 60m → 1h', formatDuration(60 * 60_000) === '1h')
  check('formatDuration 5m → 5m', formatDuration(5 * 60_000) === '5m')
  check('formatDuration negative → 0m', formatDuration(-1000) === '0m')
  check(
    'clipboard line: full',
    formatClipboardLine({ durationMs: 75 * 60_000, ticketId: 'TASK-123', text: 'Investigated login issue' }) ===
      '1h 15m | TASK-123 | Investigated login issue'
  )
  check(
    'clipboard line: no ticket drops the segment',
    formatClipboardLine({ durationMs: 30 * 60_000, ticketId: null, text: 'Standup' }) === '30m | Standup'
  )
  check(
    'clipboard line: bare duration when nothing else',
    formatClipboardLine({ durationMs: 30 * 60_000, ticketId: null, text: '' }) === '30m'
  )

  // --- back-date / createEndedBlock ---
  reset()
  {
    const task = createTask({ name: 'Backdated' }, 1_000)
    const block = createEndedBlock({ taskId: task.id, startTime: 1_000, endTime: 4_000, summary: 'note' })
    check('createEndedBlock makes an ended block', block.state === 'ended' && block.endTime === 4_000)
  }

  // --- merge ---
  reset()
  {
    const task = createTask({ name: 'Merge me' }, 0)
    const a = createEndedBlock({ taskId: task.id, startTime: 100, endTime: 200, summary: 'first' })
    const b = createEndedBlock({ taskId: task.id, startTime: 200, endTime: 300, summary: 'second' })
    const merged = mergeBlocks(a.id, b.id)
    check('merge spans both blocks', merged?.startTime === 100 && merged?.endTime === 300)
    check('merge joins summaries', merged?.summary === 'first / second')
    check('merge deletes the dropped block', getBlockById(b.id) === undefined)
  }

  reset()
  {
    const t1 = createTask({ name: 'A' }, 0)
    const t2 = createTask({ name: 'B' }, 0)
    const a = createEndedBlock({ taskId: t1.id, startTime: 0, endTime: 100, summary: null })
    const b = createEndedBlock({ taskId: t2.id, startTime: 100, endTime: 200, summary: null })
    check('merge across tasks throws', threw(() => mergeBlocks(a.id, b.id)))
    check('merge across tasks leaves both intact', !!getBlockById(a.id) && !!getBlockById(b.id))
  }

  reset()
  {
    const task = createTask({ name: 'Live' }, 0)
    const ended = createEndedBlock({ taskId: task.id, startTime: 0, endTime: 100, summary: null })
    const active = updateBlock(
      createEndedBlock({ taskId: task.id, startTime: 100, endTime: 200, summary: null }).id,
      { state: 'active', endTime: null }
    )
    check('merge rejects a non-ended block', threw(() => mergeBlocks(ended.id, active!.id)))
  }

  // --- split ---
  reset()
  {
    const task = createTask({ name: 'Split me' }, 0)
    const block = createEndedBlock({ taskId: task.id, startTime: 1_000, endTime: 5_000, summary: 's' })
    const result = splitBlock(block.id, 3_000)
    check('split first half ends at the cut', result?.first.endTime === 3_000)
    check('split second half spans cut→end', result?.second.startTime === 3_000 && result?.second.endTime === 5_000)
    check('split second half has no summary', result?.second.summary === null)
  }

  reset()
  {
    const task = createTask({ name: 'Split me' }, 0)
    const block = createEndedBlock({ taskId: task.id, startTime: 1_000, endTime: 5_000, summary: null })
    check('split outside the range throws', threw(() => splitBlock(block.id, 9_000)))
  }

  // --- inline edits + delete ---
  reset()
  {
    const task = createTask({ name: 'Edit me', ticketId: 'T-1' }, 0)
    const block = createEndedBlock({ taskId: task.id, startTime: 0, endTime: 100, summary: null })
    updateBlock(block.id, { summary: 'done' })
    check('updateBlock sets summary', getBlockById(block.id)?.summary === 'done')
    updateTask(task.id, { name: 'Renamed', ticketId: 'T-2', notes: 'context' })
    const t = getTaskById(task.id)
    check('updateTask edits name/ticket/notes', t?.name === 'Renamed' && t?.ticketId === 'T-2' && t?.notes === 'context')
    check('deleteBlock removes the block', deleteBlock(block.id) === true && getBlockById(block.id) === undefined)
  }

  // --- day membership: a midnight-spanning block belongs to its start day ---
  reset()
  {
    const task = createTask({ name: 'Late' }, 0)
    const start = new Date(2024, 5, 1, 23, 30, 0, 0).getTime()
    const end = new Date(2024, 5, 2, 0, 30, 0, 0).getTime()
    createEndedBlock({ taskId: task.id, startTime: start, endTime: end, summary: null })
    const dayOne = localDayBounds(new Date(2024, 5, 1, 12).getTime())
    const dayTwo = localDayBounds(new Date(2024, 5, 2, 12).getTime())
    check(
      'midnight-spanning block stays on its start day',
      getBlocksForRange(dayOne.start, dayOne.end).length === 1 &&
        getBlocksForRange(dayTwo.start, dayTwo.end).length === 0
    )
  }
}
