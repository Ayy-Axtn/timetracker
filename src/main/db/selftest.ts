import { writeFileSync } from 'node:fs'
import { closeDatabase, initDatabase } from './connection'
import { createTask, getRecentTasks, getTaskById, updateTask } from './tasks'
import {
  createBlock,
  deleteBlock,
  endBlock,
  getActiveBlock,
  getBlocksForRange,
  getOpenBlocks,
  getPausedBlocks,
  pauseBlock
} from './blocks'
import { localDayBounds } from '../time'

// Exercises the DB layer end to end against an in-memory database in the real
// Electron runtime (correct native ABI). Run via `npm run db:selftest`, which
// launches Electron with TIMETRACKER_SELFTEST=1. Not part of the shipped app
// flow — guarded behind that env var in index.ts.

const checks: { label: string; ok: boolean }[] = []
const check = (label: string, ok: boolean): void => {
  checks.push({ label, ok })
}

// Electron is a GUI subsystem app on Windows: console.log from the main process
// does not reliably reach a piped stdout. So results are written to the file
// named by TIMETRACKER_SELFTEST_OUT (falling back to console for local runs).
const report = (result: { ok: boolean; checks: typeof checks; error?: string }): void => {
  const out = process.env['TIMETRACKER_SELFTEST_OUT']
  if (out) {
    writeFileSync(out, JSON.stringify(result, null, 2), 'utf-8')
    return
  }
  for (const c of result.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}`)
  if (result.error) console.log(`ERROR: ${result.error}`)
}

export const runSelfTest = (): boolean => {
  try {
    return execute()
  } catch (err) {
    report({ ok: false, checks, error: err instanceof Error ? (err.stack ?? err.message) : String(err) })
    return false
  } finally {
    closeDatabase()
  }
}

const execute = (): boolean => {
  initDatabase(':memory:')
  const now = Date.now()

  // Create a task and an active block (a "New Task" in spirit).
  const task = createTask({ name: 'Investigate login bug', ticketId: 'TASK-123' }, now)
  check('task created with id', task.id > 0)
  check('task fields round-trip', task.name === 'Investigate login bug' && task.ticketId === 'TASK-123')

  const block1 = createBlock({ taskId: task.id, startTime: now, state: 'active' })
  check('active block created', block1.state === 'active' && block1.endTime === null)
  check('getActiveBlock finds it', getActiveBlock()?.id === block1.id)

  // Pause it: gains an end_time, no longer active.
  pauseBlock(block1.id, now + 5 * 60_000)
  check('paused block has end_time', getPausedBlocks()[0]?.endTime === now + 5 * 60_000)
  check('no active block after pause', getActiveBlock() === undefined)

  // Resume: a new active block for the same task; then end it with a summary.
  const block2 = createBlock({ taskId: task.id, startTime: now + 10 * 60_000, state: 'active' })
  check('resume creates new active block', getActiveBlock()?.id === block2.id)
  check('two open blocks (1 paused + 1 active)', getOpenBlocks().length === 2)

  endBlock(block2.id, now + 20 * 60_000, 'Found the cause')
  const ended = getBlocksForRange(...rangeArgs(now)).find((b) => b.id === block2.id)
  check('ended block has summary + end', ended?.state === 'ended' && ended?.summary === 'Found the cause')

  // Editing a task propagates to the joined read model.
  updateTask(task.id, { ticketId: 'TASK-999' })
  check('task update persisted', getTaskById(task.id)?.ticketId === 'TASK-999')

  // Recent tasks: the one we used today shows up.
  check('recent tasks includes our task', getRecentTasks(now - 60_000).some((t) => t.id === task.id))

  // Two blocks exist now: block1 (paused) and block2 (ended), same task.
  // Day query joins task fields and respects local-day bounds.
  const today = getBlocksForRange(...rangeArgs(now))
  check('day query returns blocks with task name', today.length === 2 && today[0]?.taskName === 'Investigate login bug')
  check('day query ordered by start_time', today[0].startTime <= today[1].startTime)

  // Hard delete leaves one block.
  check('delete removes a block', deleteBlock(block1.id) === true)
  check('block count drops after delete', getBlocksForRange(...rangeArgs(now)).length === 1)

  const ok = checks.every((c) => c.ok)
  report({ ok, checks })
  return ok
}

const rangeArgs = (ref: number): [number, number] => {
  const { start, end } = localDayBounds(ref)
  return [start, end]
}
