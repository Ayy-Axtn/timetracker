import { Notification } from 'electron'
import { getSettings } from './settings'

// Toasts serve double duty: ordinary state-change feedback and the
// trigger-health surface (a hotkey that failed to register, an unparseable
// protocol activation). 'error' toasts always show; 'info' toasts respect the
// user's showStateToasts preference.
export type ToastKind = 'info' | 'error'

export const notify = (body: string, kind: ToastKind = 'info'): void => {
  if (kind === 'info' && !getSettings().showStateToasts) return
  if (!Notification.isSupported()) return
  new Notification({ title: 'TimeTracker', body, silent: kind === 'info' }).show()
}
