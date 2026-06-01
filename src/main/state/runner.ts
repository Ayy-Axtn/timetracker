import type { TriggerAction } from '../../shared/actions'
import { getActiveBlock, getPausedBlocks } from '../db/blocks'
import { getSettings } from '../settings'
import { notify } from '../notifications'
import { setTrayState, updateTrayMenu } from '../tray'
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

// Reflect the current DB state onto side effects: heartbeat runs iff a block is
// active; the tray icon and menu mirror active/paused/idle.
const syncState = (): void => {
  const hasActive = getActiveBlock() !== undefined
  const hasPaused = getPausedBlocks().length > 0

  if (hasActive) startHeartbeat()
  else {
    stopHeartbeat()
    clearHeartbeat()
  }

  setTrayState(hasActive ? 'active' : hasPaused ? 'paused' : 'idle')
  updateTrayMenu({ hasActive, hasPaused })
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

/** Finalise on quit: keep an accurate last-alive if a block is still active. */
export const shutdownState = (): void => {
  if (getActiveBlock() !== undefined) writeHeartbeat()
  else clearHeartbeat()
  stopHeartbeat()
}
