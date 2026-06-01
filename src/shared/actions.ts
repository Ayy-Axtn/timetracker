// The complete, closed set of trigger actions. Protocol URLs and global hotkeys
// both resolve to one of these — anything else is rejected. This is the
// allow-list the brief requires for treating protocol input as untrusted.
// 'status' is a read-only quick view (no state change).
export const TRIGGER_ACTIONS = ['newtask', 'endtask', 'pausetask', 'resumetask', 'status'] as const

export type TriggerAction = (typeof TRIGGER_ACTIONS)[number]

export const isTriggerAction = (value: unknown): value is TriggerAction =>
  typeof value === 'string' && (TRIGGER_ACTIONS as readonly string[]).includes(value)

// Outcome of attempting to register one hotkey — shared so the renderer can
// display per-key results from a settings change.
export interface HotkeyResult {
  action: TriggerAction
  key: string
  ok: boolean
}

// Human-readable labels (Australian English) for toasts and menus.
export const ACTION_LABELS: Record<TriggerAction, string> = {
  newtask: 'New Task',
  endtask: 'End Task',
  pausetask: 'Pause Task',
  resumetask: 'Resume Task',
  status: 'Quick View'
}

// Maps each action to its settings.triggers.hotkeys key (camelCase differs from
// the lowercase action names used in protocol URLs).
export const HOTKEY_KEYS = {
  newtask: 'newTask',
  endtask: 'endTask',
  pausetask: 'pauseTask',
  resumetask: 'resumeTask',
  status: 'status'
} as const
