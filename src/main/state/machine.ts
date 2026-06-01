import type { Block, NewTaskInput, Task } from '../../shared/models'
import type { CrashRecoveryChoice, OpenTaskView } from '../../shared/popup'
import { getDb } from '../db/connection'
import {
  createBlock,
  deleteBlock,
  endBlock,
  getActiveBlock,
  getOpenBlocks,
  getPausedBlocks,
  pauseBlock
} from '../db/blocks'
import { createTask, getRecentTasks, getTaskById } from '../db/tasks'
import type { Prompter } from './prompter'

const DAY_MS = 24 * 60 * 60 * 1000

// Dependencies are injected so the machine stays free of Electron and the
// clock, and is fully unit-testable against an in-memory database.
export interface MachineDeps {
  prompter: Prompter
  now: () => number
  recentWindowDays: () => number
  readLastAlive: () => number | null
  notify: (message: string, kind?: 'info' | 'error') => void
}

// --- Transactional operations: each composes repo primitives atomically and
// upholds the "at most one active block" invariant. ---

// Auto-pause any active block, then start a new active block for `taskId`. Used
// inside a surrounding transaction, so it does not open one itself.
const switchActiveTo = (taskId: number, ts: number): Block => {
  const active = getActiveBlock()
  if (active) pauseBlock(active.id, ts)
  return createBlock({ taskId, startTime: ts, state: 'active' })
}

/** Create a brand-new task and immediately make it active (auto-pausing any active). */
const createTaskAndStart = (input: NewTaskInput, ts: number): { task: Task; block: Block } =>
  getDb().transaction(() => {
    const task = createTask(input, ts)
    return { task, block: switchActiveTo(task.id, ts) }
  })()

/**
 * End an open block. An active block stops now; a paused block already stopped
 * at its pause time, so we keep that — never extend a paused segment to "now".
 */
const endOpenBlock = (block: Block, now: number, summary: string | null): void => {
  const endTime = block.state === 'active' ? now : (block.endTime ?? now)
  endBlock(block.id, endTime, summary)
}

/**
 * Resume a paused task: auto-pause any active block, finalise the paused
 * segment as ended (keeping its pause-time end), then start a fresh active
 * block. Finalising keeps getPausedBlocks/getOpenBlocks meaning "current" state
 * — one open block per task — rather than leaving stale 'paused' segments.
 */
const resumePausedBlock = (paused: Block, ts: number): Block =>
  getDb().transaction(() => {
    endBlock(paused.id, paused.endTime ?? ts, null) // finalise the paused segment
    return switchActiveTo(paused.taskId, ts) // auto-pause any active, start fresh
  })()

const toViews = (blocks: Block[]): OpenTaskView[] =>
  blocks.map((b) => {
    const task = getTaskById(b.taskId)
    return {
      blockId: b.id,
      taskName: task?.name ?? 'Unknown task',
      ticketId: task?.ticketId ?? null,
      state: b.state === 'active' ? 'active' : 'paused',
      startTime: b.startTime
    }
  })

export interface StateMachine {
  newTask(): Promise<void>
  endTask(): Promise<void>
  pauseTask(): Promise<void>
  resumeTask(): Promise<void>
  /** Reconcile a stranded active block on launch. Returns true if one existed. */
  recover(): Promise<boolean>
}

export const createStateMachine = (deps: MachineDeps): StateMachine => {
  const taskName = (id: number): string => getTaskById(id)?.name ?? 'task'

  const newTask = async (): Promise<void> => {
    // 1. Resolve a currently-active task first (pause or end), per the brief.
    const active = getActiveBlock()
    if (active) {
      const choice = await deps.prompter.resolveActiveOnNew(taskName(active.taskId))
      if (choice === null) return
      if (choice === 'end') endOpenBlock(active, deps.now(), null)
      else pauseBlock(active.id, deps.now())
    }
    // 2. Gather details (with recent tasks for autocomplete).
    const recent = getRecentTasks(deps.now() - deps.recentWindowDays() * DAY_MS)
    const details = await deps.prompter.newTaskDetails(recent)
    if (details === null) return
    const name = details.name.trim()
    if (!name) return
    // 3. Create the task and start its first block.
    const { task } = createTaskAndStart(
      { name, ticketId: details.ticketId ?? null, notes: details.notes ?? null },
      deps.now()
    )
    deps.notify(`Started ${task.name}.`)
  }

  const endTask = async (): Promise<void> => {
    const open = getOpenBlocks()
    if (open.length === 0) {
      deps.notify('No open task to end.')
      return
    }
    let target = open[0]
    if (open.length > 1) {
      const blockId = await deps.prompter.pickOpenTask(toViews(open))
      if (blockId === null) return
      const picked = open.find((b) => b.id === blockId)
      if (!picked) return
      target = picked
    }
    const summary = await deps.prompter.endSummary(taskName(target.taskId))
    if (summary === null) return // cancelled
    endOpenBlock(target, deps.now(), summary.trim() ? summary.trim() : null)
    deps.notify(`Ended ${taskName(target.taskId)}.`)
  }

  const pauseTask = async (): Promise<void> => {
    const active = getActiveBlock()
    if (!active) {
      deps.notify('No active task.')
      return
    }
    const name = taskName(active.taskId)
    pauseBlock(active.id, deps.now())
    deps.notify(`Paused ${name}.`)
  }

  const resumeTask = async (): Promise<void> => {
    const paused = getPausedBlocks()
    if (paused.length === 0) {
      deps.notify('No paused tasks.')
      return
    }
    let target = paused[0]
    if (paused.length > 1) {
      const blockId = await deps.prompter.pickPausedTask(toViews(paused))
      if (blockId === null) return
      const picked = paused.find((b) => b.id === blockId)
      if (!picked) return
      target = picked
    }
    const name = taskName(target.taskId)
    resumePausedBlock(target, deps.now())
    deps.notify(`Resumed ${name}.`)
  }

  const recover = async (): Promise<boolean> => {
    const stranded = getActiveBlock()
    if (!stranded) return false
    const lastAlive = deps.readLastAlive()
    const choice = await deps.prompter.crashRecovery(taskName(stranded.taskId), lastAlive)
    applyRecovery(stranded, choice, lastAlive)
    return true
  }

  return { newTask, endTask, pauseTask, resumeTask, recover }
}

// Reconcile a stranded block. Durations are never invented: 'end' uses the
// heartbeat's last-alive time (falling back to the block's own start, i.e. zero
// duration, if no heartbeat exists); 'resume'/dismiss leave it running.
const applyRecovery = (
  stranded: Block,
  choice: CrashRecoveryChoice | null,
  lastAlive: number | null
): void => {
  switch (choice) {
    case 'end':
      endBlock(stranded.id, lastAlive ?? stranded.startTime, null)
      break
    case 'discard':
      deleteBlock(stranded.id)
      break
    case 'resume':
    case null:
    default:
      break // leave the block active; the heartbeat resumes for it
  }
}
