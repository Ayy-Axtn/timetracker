import type { Block, BlockPatch, BlockWithTask, NewBlockInput } from '../../shared/models'
import { getDb } from './connection'

// Low-level block persistence. These are primitives: they do not enforce the
// "at most one active block" invariant or the pause/resume choreography — that
// lives in the state machine (step 4), which composes these calls in a
// transaction. The Today's Log editor (step 6) uses the read/edit/delete ones.

interface BlockRow {
  id: number
  task_id: number
  start_time: number
  end_time: number | null
  state: Block['state']
  summary: string | null
}

const toBlock = (row: BlockRow): Block => ({
  id: row.id,
  taskId: row.task_id,
  startTime: row.start_time,
  endTime: row.end_time,
  state: row.state,
  summary: row.summary
})

export const createBlock = (input: NewBlockInput): Block => {
  const info = getDb()
    .prepare('INSERT INTO blocks (task_id, start_time, end_time, state, summary) VALUES (?, ?, NULL, ?, NULL)')
    .run(input.taskId, input.startTime, input.state ?? 'active')
  return getBlockById(Number(info.lastInsertRowid)) as Block
}

export const getBlockById = (id: number): Block | undefined => {
  const row = getDb().prepare('SELECT * FROM blocks WHERE id = ?').get(id) as BlockRow | undefined
  return row ? toBlock(row) : undefined
}

/** The single active block, if any. */
export const getActiveBlock = (): Block | undefined => {
  const row = getDb()
    .prepare("SELECT * FROM blocks WHERE state = 'active' ORDER BY start_time DESC LIMIT 1")
    .get() as BlockRow | undefined
  return row ? toBlock(row) : undefined
}

export const getPausedBlocks = (): Block[] => {
  const rows = getDb()
    .prepare("SELECT * FROM blocks WHERE state = 'paused' ORDER BY start_time ASC")
    .all() as BlockRow[]
  return rows.map(toBlock)
}

/** Open blocks = active + paused, the set the End Task picker chooses from. */
export const getOpenBlocks = (): Block[] => {
  const rows = getDb()
    .prepare("SELECT * FROM blocks WHERE state IN ('active', 'paused') ORDER BY start_time ASC")
    .all() as BlockRow[]
  return rows.map(toBlock)
}

/** Close a block: set its end time, mark it ended, attach an optional summary. */
export const endBlock = (id: number, endTime: number, summary: string | null = null): Block | undefined => {
  getDb()
    .prepare("UPDATE blocks SET end_time = ?, state = 'ended', summary = ? WHERE id = ?")
    .run(endTime, summary, id)
  return getBlockById(id)
}

/** Pause a block: it gets an end time (invariant) but keeps its summary slot. */
export const pauseBlock = (id: number, endTime: number): Block | undefined => {
  getDb().prepare("UPDATE blocks SET end_time = ?, state = 'paused' WHERE id = ?").run(endTime, id)
  return getBlockById(id)
}

export const updateBlock = (id: number, patch: BlockPatch): Block | undefined => {
  const sets: string[] = []
  const values: unknown[] = []
  if (patch.startTime !== undefined) {
    sets.push('start_time = ?')
    values.push(patch.startTime)
  }
  if (patch.endTime !== undefined) {
    sets.push('end_time = ?')
    values.push(patch.endTime)
  }
  if (patch.summary !== undefined) {
    sets.push('summary = ?')
    values.push(patch.summary)
  }
  if (patch.state !== undefined) {
    sets.push('state = ?')
    values.push(patch.state)
  }
  if (sets.length === 0) return getBlockById(id)

  values.push(id)
  getDb()
    .prepare(`UPDATE blocks SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values)
  return getBlockById(id)
}

/** Hard delete (no soft-delete in v1). Returns whether a row was removed. */
export const deleteBlock = (id: number): boolean =>
  getDb().prepare('DELETE FROM blocks WHERE id = ?').run(id).changes > 0

/**
 * Blocks whose start_time falls in [startMs, endMs), joined with their task,
 * ordered chronologically. A block belongs to the local calendar day of its
 * start, so the caller passes local-midnight bounds; a block spanning midnight
 * stays wholly on its start day.
 */
export const getBlocksForRange = (startMs: number, endMs: number): BlockWithTask[] => {
  const rows = getDb()
    .prepare(
      `SELECT b.*, t.name AS task_name, t.ticket_id AS join_ticket_id, t.notes AS task_notes
         FROM blocks b
         JOIN tasks t ON t.id = b.task_id
        WHERE b.start_time >= ? AND b.start_time < ?
        ORDER BY b.start_time ASC`
    )
    .all(startMs, endMs) as (BlockRow & {
    task_name: string
    join_ticket_id: string | null
    task_notes: string | null
  })[]

  return rows.map((row) => ({
    ...toBlock(row),
    taskName: row.task_name,
    ticketId: row.join_ticket_id,
    taskNotes: row.task_notes
  }))
}
