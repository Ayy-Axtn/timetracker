import { dialog } from 'electron'
import { notify } from '../notifications'
import type { CrashRecoveryChoice, Prompter } from './prompter'

// Interim prompter for step 4: the rich popups (New Task form, pickers, summary)
// arrive in step 5, so those paths surface a toast and cancel. Flows that need
// no input work fully (Pause, single-task Resume/End). Crash recovery uses a
// native dialog so the data-safety feature genuinely works now; step 5 replaces
// it with the styled popup.

const formatTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })

export const interimPrompter: Prompter = {
  async newTaskDetails() {
    notify('The New Task popup arrives in step 5.', 'info')
    return null
  },

  async resolveActiveOnNew() {
    notify('The New Task popup arrives in step 5.', 'info')
    return null
  },

  async pickOpenTask() {
    notify('The task picker arrives in step 5.', 'info')
    return null
  },

  // End proceeds with no summary for now; the summary popup arrives in step 5.
  async endSummary() {
    return ''
  },

  async pickPausedTask() {
    notify('The task picker arrives in step 5.', 'info')
    return null
  },

  async crashRecovery(taskName: string, lastAlive: number | null): Promise<CrashRecoveryChoice | null> {
    // Test hook: answer recovery non-interactively for integration tests.
    const auto = process.env['TIMETRACKER_RECOVERY_AUTO']
    if (auto === 'resume' || auto === 'end' || auto === 'discard') return auto

    const endLabel = lastAlive ? `End at ${formatTime(lastAlive)}` : 'End at start'
    const { response } = await dialog.showMessageBox({
      type: 'question',
      title: 'TimeTracker — recover session',
      message: `You had '${taskName}' running when the app last closed.`,
      detail: 'Resume it, end it at the last-alive time, or discard it.',
      buttons: ['Resume', endLabel, 'Discard'],
      defaultId: 0,
      cancelId: 0, // dismiss = Resume (never lose data)
      noLink: true
    })
    return (['resume', 'end', 'discard'] as const)[response] ?? 'resume'
  }
}
