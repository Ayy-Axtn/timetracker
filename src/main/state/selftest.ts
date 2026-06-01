import { writeFileSync } from 'node:fs'
import { closeDatabase, getDb, initDatabase } from '../db/connection'
import { createBlock, getActiveBlock, getBlockById, getOpenBlocks, getPausedBlocks, pauseBlock } from '../db/blocks'
import { createTask } from '../db/tasks'
import type { Block } from '../../shared/models'
import { createStateMachine } from './machine'
import type { Prompter } from './prompter'

// Per-transition unit tests for the state machine, run against an in-memory
// database in the real Electron runtime. Setup seeds blocks directly via the
// repos; the action under test runs through the machine with a scripted
// prompter and a controllable clock. Guarded by TIMETRACKER_STATE_SELFTEST.

const checks: { label: string; ok: boolean }[] = []
const check = (label: string, ok: boolean): void => {
  checks.push({ label, ok })
}

let clock = 1_700_000_000_000
let lastAlive: number | null = null
let toasts: string[] = []

const now = (): number => clock
const notify = (message: string): void => {
  toasts.push(message)
}

const basePrompter: Prompter = {
  newTaskDetails: async () => null,
  resolveActiveOnNew: async () => null,
  pickOpenTask: async () => null,
  endSummary: async () => '',
  pickPausedTask: async () => null,
  crashRecovery: async () => 'resume'
}

const machineWith = (overrides: Partial<Prompter>) =>
  createStateMachine({
    prompter: { ...basePrompter, ...overrides },
    now,
    recentWindowDays: () => 14,
    readLastAlive: () => lastAlive,
    notify
  })

const reset = (): void => {
  closeDatabase()
  initDatabase(':memory:')
  toasts = []
  lastAlive = null
}

const activeCount = (): number =>
  (getDb().prepare("SELECT COUNT(*) AS c FROM blocks WHERE state = 'active'").get() as { c: number }).c

// Seed helpers (bypass prompts for deterministic setup).
const seedActive = (name: string, start: number): Block => {
  const task = createTask({ name }, start)
  return createBlock({ taskId: task.id, startTime: start, state: 'active' })
}
const seedPaused = (name: string, start: number, pauseAt: number): Block => {
  const block = seedActive(name, start)
  pauseBlock(block.id, pauseAt)
  return getBlockById(block.id) as Block
}

const report = (result: { ok: boolean; checks: typeof checks; error?: string }): void => {
  const out = process.env['TIMETRACKER_STATE_SELFTEST_OUT']
  if (out) writeFileSync(out, JSON.stringify(result, null, 2), 'utf-8')
  else for (const c of result.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}`)
}

export const runStateSelfTest = async (): Promise<boolean> => {
  try {
    await execute()
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

const execute = async (): Promise<void> => {
  // === Pause ===
  reset()
  await machineWith({}).pauseTask()
  check('pause with nothing active is a no-op', getActiveBlock() === undefined)
  check('pause with nothing active toasts', toasts.some((t) => t.includes('No active')))

  reset()
  clock = 5_000
  seedActive('Alpha', 5_000)
  clock = 305_000 // +5 min
  await machineWith({}).pauseTask()
  check('pause moves active → paused', getActiveBlock() === undefined && getPausedBlocks().length === 1)
  check('pause preserves elapsed (end = pause time)', getPausedBlocks()[0].endTime === 305_000)

  // === New Task ===
  reset()
  clock = 10_000
  await machineWith({ newTaskDetails: async () => ({ name: 'Build feature', ticketId: 'T-1' }) }).newTask()
  {
    const active = getActiveBlock()
    check('new task from idle creates an active block', active !== undefined && active.startTime === 10_000)
    check('new task invariant: exactly one active', activeCount() === 1)
  }

  reset()
  clock = 1_000
  seedActive('Alpha', 1_000)
  clock = 2_000
  await machineWith({
    resolveActiveOnNew: async () => 'pause',
    newTaskDetails: async () => ({ name: 'Beta' })
  }).newTask()
  check('new task with active + pause: old paused', getPausedBlocks().length === 1)
  check('new task with active + pause: one active', activeCount() === 1)

  reset()
  clock = 1_000
  const alphaToEnd = seedActive('Alpha', 1_000)
  clock = 2_000
  await machineWith({
    resolveActiveOnNew: async () => 'end',
    newTaskDetails: async () => ({ name: 'Gamma' })
  }).newTask()
  check('new task with active + end: old ended', getBlockById(alphaToEnd.id)?.state === 'ended')
  check('new task with active + end: no paused, one active', getPausedBlocks().length === 0 && activeCount() === 1)

  reset()
  seedActive('Alpha', 1_000)
  await machineWith({ resolveActiveOnNew: async () => null }).newTask()
  check('new task cancelled at resolve leaves active untouched', getActiveBlock()?.startTime === 1_000)

  reset()
  await machineWith({ newTaskDetails: async () => null }).newTask()
  check('new task cancelled at details creates nothing', activeCount() === 0)

  // === End ===
  reset()
  await machineWith({}).endTask()
  check('end with nothing open toasts', toasts.some((t) => t.includes('No open task')))

  reset()
  clock = 1_000
  const active1 = seedActive('Alpha', 1_000)
  clock = 601_000 // +10 min
  await machineWith({ endSummary: async () => 'Shipped it' }).endTask()
  {
    const ended = getBlockById(active1.id)
    check('end active: ended at now with summary', ended?.state === 'ended' && ended?.endTime === 601_000 && ended?.summary === 'Shipped it')
    check('end active: nothing open afterwards', getOpenBlocks().length === 0)
  }

  reset()
  const pausedToEnd = seedPaused('Alpha', 1_000, 301_000)
  clock = 900_000
  await machineWith({ endSummary: async () => '' }).endTask()
  {
    const ended = getBlockById(pausedToEnd.id)
    check('end paused: keeps pause-time end, not now', ended?.state === 'ended' && ended?.endTime === 301_000)
    check('end paused: empty summary stored as null', ended?.summary === null)
  }

  reset()
  const pAlpha = seedPaused('Alpha', 1_000, 2_000)
  const bBeta = seedActive('Beta', 3_000)
  clock = 4_000
  await machineWith({
    pickOpenTask: async () => pAlpha.id,
    endSummary: async () => 'note'
  }).endTask()
  check('end picks chosen open task', getBlockById(pAlpha.id)?.state === 'ended')
  check('end leaves the unpicked task open', getBlockById(bBeta.id)?.state === 'active')

  reset()
  const noEnd = seedActive('Alpha', 1_000)
  await machineWith({ endSummary: async () => null }).endTask()
  check('end cancelled at summary leaves block active', getBlockById(noEnd.id)?.state === 'active')

  // === Resume ===
  reset()
  await machineWith({}).resumeTask()
  check('resume with nothing paused toasts', toasts.some((t) => t.includes('No paused')))

  reset()
  const onlyPaused = seedPaused('Alpha', 1_000, 2_000)
  clock = 3_000
  await machineWith({}).resumeTask()
  check('resume single: finalises old paused segment as ended', getBlockById(onlyPaused.id)?.state === 'ended')
  check('resume single: new active block, none paused', activeCount() === 1 && getPausedBlocks().length === 0)

  reset()
  const resPaused = seedPaused('Alpha', 1_000, 2_000)
  const resActive = seedActive('Beta', 3_000)
  clock = 4_000
  await machineWith({}).resumeTask()
  check('resume auto-pauses the active task first', getBlockById(resActive.id)?.state === 'paused')
  check('resume: exactly one active afterwards', activeCount() === 1)
  check('resume: resumed task is active (old segment ended)', getBlockById(resPaused.id)?.state === 'ended')

  reset()
  seedPaused('Alpha', 1_000, 2_000)
  const betaPaused = seedPaused('Beta', 3_000, 4_000)
  clock = 5_000
  await machineWith({ pickPausedTask: async () => betaPaused.id }).resumeTask()
  check('resume picks the chosen paused task', getActiveBlock()?.taskId === betaPaused.taskId)
  check('resume leaves the unpicked task paused', getPausedBlocks().length === 1)

  reset()
  const unpicked = seedPaused('Alpha', 1_000, 2_000)
  seedPaused('Beta', 3_000, 4_000)
  await machineWith({ pickPausedTask: async () => null }).resumeTask()
  check('resume cancelled at picker changes nothing', getBlockById(unpicked.id)?.state === 'paused' && activeCount() === 0)

  // === Crash recovery ===
  reset()
  const r1 = seedActive('Alpha', 1_000)
  lastAlive = 301_000
  await machineWith({ crashRecovery: async () => 'end' }).recover()
  check('recovery end: closes at last-alive time', getBlockById(r1.id)?.state === 'ended' && getBlockById(r1.id)?.endTime === 301_000)

  reset()
  const r2 = seedActive('Alpha', 7_000)
  lastAlive = null
  await machineWith({ crashRecovery: async () => 'end' }).recover()
  check('recovery end without heartbeat: falls back to block start', getBlockById(r2.id)?.endTime === 7_000)

  reset()
  const r3 = seedActive('Alpha', 1_000)
  await machineWith({ crashRecovery: async () => 'discard' }).recover()
  check('recovery discard: block hard-deleted', getBlockById(r3.id) === undefined)

  reset()
  const r4 = seedActive('Alpha', 1_000)
  await machineWith({ crashRecovery: async () => 'resume' }).recover()
  check('recovery resume: block stays active', getBlockById(r4.id)?.state === 'active' && getBlockById(r4.id)?.endTime === null)

  reset()
  const recovered = await machineWith({}).recover()
  check('recovery with no stranded block returns false', recovered === false)
}
