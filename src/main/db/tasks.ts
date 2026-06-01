import type { NewTaskInput, Task, TaskPatch } from '../../shared/models'
import { getDb } from './connection'

// Every statement is parameterised. Column lists in dynamic updates come from a
// fixed in-code whitelist, never from caller-supplied keys.

interface TaskRow {
  id: number
  name: string
  ticket_id: string | null
  notes: string | null
  created_at: number
}

const toTask = (row: TaskRow): Task => ({
  id: row.id,
  name: row.name,
  ticketId: row.ticket_id,
  notes: row.notes,
  createdAt: row.created_at
})

export const createTask = (input: NewTaskInput, createdAt: number): Task => {
  const info = getDb()
    .prepare('INSERT INTO tasks (name, ticket_id, notes, created_at) VALUES (?, ?, ?, ?)')
    .run(input.name, input.ticketId ?? null, input.notes ?? null, createdAt)
  return getTaskById(Number(info.lastInsertRowid)) as Task
}

export const getTaskById = (id: number): Task | undefined => {
  const row = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined
  return row ? toTask(row) : undefined
}

export const updateTask = (id: number, patch: TaskPatch): Task | undefined => {
  const sets: string[] = []
  const values: unknown[] = []
  if (patch.name !== undefined) {
    sets.push('name = ?')
    values.push(patch.name)
  }
  if (patch.ticketId !== undefined) {
    sets.push('ticket_id = ?')
    values.push(patch.ticketId)
  }
  if (patch.notes !== undefined) {
    sets.push('notes = ?')
    values.push(patch.notes)
  }
  if (sets.length === 0) return getTaskById(id)

  values.push(id)
  getDb()
    .prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values)
  return getTaskById(id)
}

/**
 * Tasks worked on since `sinceMs` (i.e. with a block starting in that window),
 * most-recently-used first. Backs the recent-tasks autocomplete in the New Task
 * popup; the caller derives `sinceMs` from settings.recentTasksWindowDays.
 */
export const getRecentTasks = (sinceMs: number, limit = 50): Task[] => {
  const rows = getDb()
    .prepare(
      `SELECT t.*
         FROM tasks t
         JOIN (
           SELECT task_id, MAX(start_time) AS last_start
             FROM blocks
            WHERE start_time >= ?
            GROUP BY task_id
         ) recent ON recent.task_id = t.id
        ORDER BY recent.last_start DESC
        LIMIT ?`
    )
    .all(sinceMs, limit) as TaskRow[]
  return rows.map(toTask)
}
