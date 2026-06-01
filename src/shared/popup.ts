import type { NewTaskInput, Task } from './models'

// Contract shared by the main-process popup manager and the renderer popup app.
// The state machine asks for input by showing one of these modes; the renderer
// replies with the mode's result (or null to cancel).

export type PopupMode =
  | 'newTask'
  | 'resolveActive'
  | 'pickOpen'
  | 'endSummary'
  | 'pickPaused'
  | 'crashRecovery'

/** A single open (active or paused) task, as shown in a picker. */
export interface OpenTaskView {
  blockId: number
  taskName: string
  ticketId: string | null
  state: 'active' | 'paused'
  startTime: number
}

export type ResolveActiveChoice = 'pause' | 'end'
export type CrashRecoveryChoice = 'resume' | 'end' | 'discard'

// Per-mode payloads (main → renderer).
export interface NewTaskPayload {
  recent: Task[]
}
export interface ResolveActivePayload {
  taskName: string
}
export interface PickPayload {
  title: string
  tasks: OpenTaskView[]
}
export interface EndSummaryPayload {
  taskName: string
}
export interface CrashRecoveryPayload {
  taskName: string
  lastAlive: number | null
}

export type PopupPayload =
  | NewTaskPayload
  | ResolveActivePayload
  | PickPayload
  | EndSummaryPayload
  | CrashRecoveryPayload

// Per-mode results (renderer → main); null always means cancelled.
export type PopupResult =
  | NewTaskInput // newTask
  | ResolveActiveChoice // resolveActive
  | CrashRecoveryChoice // crashRecovery
  | number // pickOpen / pickPaused → blockId
  | string // endSummary (may be empty)

/** Envelope sent to the renderer to render a mode. */
export interface PopupRequest {
  requestId: number
  mode: PopupMode
  payload: PopupPayload
}
