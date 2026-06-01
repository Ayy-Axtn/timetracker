import type { NewTaskInput } from '../../shared/models'
import type { CrashRecoveryChoice, ResolveActiveChoice } from '../../shared/popup'
import type { Prompter } from '../state/prompter'
import { prompt } from './popup'

// The real Prompter: every method shows a popup mode and awaits the renderer's
// reply. Replaces the step-4 interim prompter and the native recovery dialog.
export const popupPrompter: Prompter = {
  newTaskDetails: (recent) => prompt<NewTaskInput>('newTask', { recent }),

  resolveActiveOnNew: (taskName) => prompt<ResolveActiveChoice>('resolveActive', { taskName }),

  pickOpenTask: (open) => prompt<number>('pickOpen', { title: 'End which task?', tasks: open }),

  endSummary: (taskName) => prompt<string>('endSummary', { taskName }),

  pickPausedTask: (paused) => prompt<number>('pickPaused', { title: 'Resume which task?', tasks: paused }),

  crashRecovery: (taskName, lastAlive) => {
    // Test hook: answer recovery non-interactively for the step-4 integration test.
    const auto = process.env['TIMETRACKER_RECOVERY_AUTO']
    if (auto === 'resume' || auto === 'end' || auto === 'discard') {
      return Promise.resolve<CrashRecoveryChoice>(auto)
    }
    return prompt<CrashRecoveryChoice>('crashRecovery', { taskName, lastAlive })
  }
}
