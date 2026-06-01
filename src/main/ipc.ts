import { app, clipboard, ipcMain } from 'electron'
import type { HotkeyMap, Settings } from '../shared/settings'
import type { HotkeyResult } from '../shared/actions'
import type {
  BackdateInput,
  Block,
  BlockPatch,
  BlockWithTask,
  NewTaskInput,
  Task,
  TaskPatch
} from '../shared/models'
import { getSettings } from './settings'
import { createTask, getRecentTasks, updateTask } from './db/tasks'
import {
  createEndedBlock,
  deleteBlock,
  getBlocksForRange,
  mergeBlocks,
  splitBlock,
  updateBlock
} from './db/blocks'
import { getDb } from './db/connection'
import { localDayBounds } from './time'
import { updateHotkeys } from './triggers/hotkeys'
import { applySettings } from './settings-actions'
import { resyncState } from './state/runner'

const DAY_MS = 24 * 60 * 60 * 1000

// IPC surface reachable from the renderer (only what preload re-exposes). Every
// handler is request/response via ipcMain.handle. Trigger-driven block
// mutations (new/end/pause/resume) are deliberately NOT here — they arrive in
// step 4 behind the state machine, not as raw renderer calls.
export const registerIpcHandlers = (): void => {
  ipcMain.handle('app:get-version', () => app.getVersion())

  ipcMain.handle('settings:get', (): Settings => getSettings())
  // applySettings persists and applies any OS-level side effect that changed
  // (launch-at-startup, protocol registration, hotkey enablement).
  ipcMain.handle('settings:update', (_event, patch: Partial<Settings>): Settings =>
    applySettings(patch)
  )

  ipcMain.handle('tasks:create', (_event, input: NewTaskInput): Task => {
    const name = typeof input?.name === 'string' ? input.name.trim() : ''
    if (!name) throw new Error('Task name is required')
    return createTask(
      { name, ticketId: input.ticketId ?? null, notes: input.notes ?? null },
      Date.now()
    )
  })

  ipcMain.handle('tasks:recent', (_event, windowDays?: number): Task[] => {
    const days = typeof windowDays === 'number' ? windowDays : getSettings().recentTasksWindowDays
    return getRecentTasks(Date.now() - days * DAY_MS)
  })

  // `referenceMs` selects the day (defaults to today); a block belongs to the
  // local calendar day of its start_time.
  ipcMain.handle('blocks:forDay', (_event, referenceMs?: number): BlockWithTask[] => {
    const { start, end } = localDayBounds(typeof referenceMs === 'number' ? referenceMs : Date.now())
    return getBlocksForRange(start, end)
  })

  // Validate-before-persist: the new hotkey map is only saved if every key
  // registers, so a user can't lock themselves out (used by the settings UI).
  ipcMain.handle(
    'triggers:set-hotkeys',
    (_event, map: HotkeyMap): { ok: boolean; results: HotkeyResult[] } => {
      const result = updateHotkeys(map)
      resyncState() // clears a trigger-error tray state once keys register cleanly
      return result
    }
  )

  // --- Today's Log editor. Each mutation resyncs the tray/heartbeat, since
  // editing a live block can change what's active or paused. ---

  ipcMain.handle('tasks:update', (_event, id: number, patch: TaskPatch): Task | undefined => {
    const result = updateTask(id, patch)
    resyncState()
    return result
  })

  ipcMain.handle('blocks:update', (_event, id: number, patch: BlockPatch): Block | undefined => {
    const result = updateBlock(id, patch)
    resyncState()
    return result
  })

  ipcMain.handle('blocks:delete', (_event, id: number): boolean => {
    const result = deleteBlock(id)
    resyncState()
    return result
  })

  ipcMain.handle('blocks:merge', (_event, keepId: number, dropId: number): Block | undefined => {
    const result = mergeBlocks(keepId, dropId)
    resyncState()
    return result
  })

  ipcMain.handle('blocks:split', (_event, id: number, atMs: number) => {
    const result = splitBlock(id, atMs)
    resyncState()
    return result
  })

  ipcMain.handle('blocks:backdate', (_event, input: BackdateInput): Block => {
    const name = typeof input?.name === 'string' ? input.name.trim() : ''
    if (!name) throw new Error('Task name is required')
    const start = Number(input.startTime)
    const end = Number(input.endTime)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error('Invalid time range')
    }
    const block = getDb().transaction(() => {
      const task = createTask(
        { name, ticketId: input.ticketId ?? null, notes: input.notes ?? null },
        Date.now()
      )
      return createEndedBlock({
        taskId: task.id,
        startTime: start,
        endTime: end,
        summary: input.summary?.trim() || null
      })
    })()
    resyncState()
    return block
  })

  ipcMain.handle('clipboard:write', (_event, text: string): void => {
    clipboard.writeText(String(text))
  })
}
