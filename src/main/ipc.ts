import { app, ipcMain } from 'electron'
import type { Settings } from '../shared/settings'
import type { BlockWithTask, NewTaskInput, Task } from '../shared/models'
import { getSettings, updateSettings } from './settings'
import { createTask, getRecentTasks } from './db/tasks'
import { getBlocksForRange } from './db/blocks'
import { localDayBounds } from './time'

const DAY_MS = 24 * 60 * 60 * 1000

// IPC surface reachable from the renderer (only what preload re-exposes). Every
// handler is request/response via ipcMain.handle. Trigger-driven block
// mutations (new/end/pause/resume) are deliberately NOT here — they arrive in
// step 4 behind the state machine, not as raw renderer calls.
export const registerIpcHandlers = (): void => {
  ipcMain.handle('app:get-version', () => app.getVersion())

  ipcMain.handle('settings:get', (): Settings => getSettings())
  ipcMain.handle('settings:update', (_event, patch: Partial<Settings>): Settings =>
    updateSettings(patch)
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
}
