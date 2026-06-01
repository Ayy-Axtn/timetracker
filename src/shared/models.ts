// Domain types shared across main, preload, and renderer. DB columns are
// snake_case; these are the camelCase shapes the repositories map rows into.
// Timestamps are Unix milliseconds throughout.

export type BlockState = 'active' | 'paused' | 'ended'

export interface Task {
  id: number
  name: string
  ticketId: string | null
  notes: string | null
  createdAt: number
}

export interface Block {
  id: number
  taskId: number
  startTime: number
  /** NULL only while active; paused and ended blocks always have an end. */
  endTime: number | null
  state: BlockState
  summary: string | null
}

/** A block joined with its task — the read model for the Today's Log view. */
export interface BlockWithTask extends Block {
  taskName: string
  ticketId: string | null
  taskNotes: string | null
}

export interface NewTaskInput {
  name: string
  ticketId?: string | null
  notes?: string | null
}

export interface TaskPatch {
  name?: string
  ticketId?: string | null
  notes?: string | null
}

export interface NewBlockInput {
  taskId: number
  startTime: number
  /** Defaults to 'active'. */
  state?: BlockState
}

export interface BlockPatch {
  startTime?: number
  endTime?: number | null
  summary?: string | null
  state?: BlockState
}

/** Manually adding a forgotten block from the Today's Log (back-date). */
export interface BackdateInput {
  name: string
  ticketId?: string | null
  notes?: string | null
  startTime: number
  endTime: number
  summary?: string | null
}
