import type { TriggerAction } from '../../shared/actions'
import { getActiveBlock, getPausedBlocks } from '../db/blocks'
import { getTaskById } from '../db/tasks'
import { getSettings } from '../settings'
import { notify } from '../notifications'
import { formatTrayTooltip, setTrayState, setTrayTooltip, updateTrayMenu } from '../tray'
import { notifyBlocksChanged } from '../windows'
import { createStateMachine } from './machine'
import { popupPrompter } from '../popup/prompter'
import { clearHeartbeat, readHeartbeat, startHeartbeat, stopHeartbeat, writeHeartbeat } from './heartbeat'

// Production wiring of the state machine. Lives here (not in machine.ts) so the
// machine stays Electron-free and testable; this module owns the side effects:
// the action queue, the heartbeat lifecycle, and the tray reflection.

const machine = createStateMachine({
  prompter: popupPrompter,
  now: () => Date.now(),
  recentWindowDays: () => getSettings().recentTasksWindowDays,
  readLastAlive: () => readHeartbeat(),
  notify
})

let tooltipTimer: ReturnType<typeof setInterval> | null = null

// Set the tray tooltip to the running task + live elapsed (or a generic label).
const refreshTooltip = (): void => {
  const active = getActiveBlock()
  if (active) {
    setTrayTooltip(formatTrayTooltip('active', getTaskById(active.taskId)?.name, Date.now() - active.startTime))
  } else {
    setTrayTooltip(formatTrayTooltip(getPausedBlocks().length > 0 ? 'paused' : 'idle'))
  }
}

// Reflect the current DB state onto side effects: heartbeat + ticking tooltip
// run iff a block is active; the tray icon and menu mirror active/paused/idle.
const syncState = (): void => {
  const hasActive = getActiveBlock() !== undefined
  const hasPaused = getPausedBlocks().length > 0

  if (hasActive) {
    startHeartbeat()
    if (!tooltipTimer) tooltipTimer = setInterval(refreshTooltip, 1000)
  } else {
    stopHeartbeat()
    clearHeartbeat()
    if (tooltipTimer) {
      clearInterval(tooltipTimer)
      tooltipTimer = null
    }
  }

  setTrayState(hasActive ? 'active' : hasPaused ? 'paused' : 'idle')
  updateTrayMenu({ hasActive, hasPaused })
  refreshTooltip()
  notifyBlocksChanged() // keep an open Today's Log window live
}

const dispatch = (action: TriggerAction): Promise<void> => {
  switch (action) {
    case 'newtask':
      return machine.newTask()
    case 'endtask':
      return machine.endTask()
    case 'pausetask':
      return machine.pauseTask()
    case 'resumetask':
      return machine.resumeTask()
  }
}

// Serialise everything: transitions await user input, so they must not interleave
// (two New Tasks, a Pause mid-Resume, etc.). Each runs to completion, then syncs.
let chain: Promise<void> = Promise.resolve()

const enqueue = (work: () => Promise<void>): Promise<void> => {
  chain = chain
    .then(work)
    .then(syncState)
    .catch((err) => console.error('State transition failed:', err))
  return chain
}

export const runAction = (action: TriggerAction): Promise<void> => enqueue(() => dispatch(action))

/** Reconcile a stranded block on launch (queued ahead of any user actions). */
export const runRecovery = (): Promise<void> => enqueue(() => machine.recover().then(() => undefined))

/**
 * Re-derive side effects (tray + heartbeat) from the current DB state. The
 * Today's Log editor calls this after a mutation, since deleting/editing a
 * live block can change what's active or paused.
 */
export const resyncState = (): void => syncState()

/** Finalise on quit: keep an accurate last-alive if a block is still active. */
export const shutdownState = (): void => {
  if (getActiveBlock() !== undefined) writeHeartbeat()
  else clearHeartbeat()
  stopHeartbeat()
  if (tooltipTimer) {
    clearInterval(tooltipTimer)
    tooltipTimer = null
  }
}
