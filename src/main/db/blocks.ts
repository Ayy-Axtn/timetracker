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

// --- Today's Log editor operations ---
// Merge/split deliberately operate on ENDED blocks only: active/paused blocks
// are "live" and editing them would risk the state-machine invariants. They run
// in transactions so a failed validation rolls back cleanly.

/** Insert a fully-formed historical (ended) block — used by back-date and split. */
export const createEndedBlock = (input: {
  taskId: number
  startTime: number
  endTime: number
  summary: string | null
}): Block => {
  const info = getDb()
    .prepare("INSERT INTO blocks (task_id, start_time, end_time, state, summary) VALUES (?, ?, ?, 'ended', ?)")
    .run(input.taskId, input.startTime, input.endTime, input.summary)
  return getBlockById(Number(info.lastInsertRowid)) as Block
}

/** Combine two ended blocks of the same task into the first; deletes the second. */
export const mergeBlocks = (keepId: number, dropId: number): Block | undefined =>
  getDb().transaction(() => {
    const keep = getBlockById(keepId)
    const drop = getBlockById(dropId)
    if (!keep || !drop) return undefined
    if (keep.taskId !== drop.taskId) throw new Error('Cannot merge blocks from different tasks')
    if (keep.state !== 'ended' || drop.state !== 'ended') throw new Error('Only ended blocks can be merged')

    const startTime = Math.min(keep.startTime, drop.startTime)
    const endTime = Math.max(keep.endTime ?? keep.startTime, drop.endTime ?? drop.startTime)
    const summary = [keep.summary, drop.summary].filter((s): s is string => !!s).join(' / ') || null

    getDb()
      .prepare('UPDATE blocks SET start_time = ?, end_time = ?, summary = ? WHERE id = ?')
      .run(startTime, endTime, summary, keepId)
    deleteBlock(dropId)
    return getBlockById(keepId)
  })()

/** Split an ended block at `atMs` into [start, atMs] and [atMs, end]. */
export const splitBlock = (id: number, atMs: number): { first: Block; second: Block } | undefined =>
  getDb().transaction(() => {
    const block = getBlockById(id)
    if (!block) return undefined
    if (block.state !== 'ended' || block.endTime === null) throw new Error('Only ended blocks can be split')
    if (!(block.startTime < atMs && atMs < block.endTime)) {
      throw new Error('Split time must be inside the block')
    }
    getDb().prepare('UPDATE blocks SET end_time = ? WHERE id = ?').run(atMs, id)
    const second = createEndedBlock({
      taskId: block.taskId,
      startTime: atMs,
      endTime: block.endTime,
      summary: null
    })
    return { first: getBlockById(id) as Block, second }
  })()

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
