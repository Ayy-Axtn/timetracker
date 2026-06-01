import type { NewTaskInput, Task } from '../../shared/models'
import type { CrashRecoveryChoice, OpenTaskView, ResolveActiveChoice } from '../../shared/popup'

// The state machine asks for user input through this interface rather than
// touching any window. Step 5 implements it with the real popups (popupPrompter);
// step 4 unit tests inject scripted stubs. Returning null means the user
// cancelled (Esc) and the transition is abandoned with no side effects.

export type { CrashRecoveryChoice, OpenTaskView, ResolveActiveChoice }

export interface Prompter {
  /** New Task: gather name (required) + optional ticket/notes. Recent tasks for autocomplete. */
  newTaskDetails(recent: Task[]): Promise<NewTaskInput | null>
  /** When New Task is invoked with a task already active: pause it or end it? */
  resolveActiveOnNew(activeTaskName: string): Promise<ResolveActiveChoice | null>
  /** End Task with more than one open task: which block to end? Returns blockId. */
  pickOpenTask(open: OpenTaskView[]): Promise<number | null>
  /** End Task closing note (optional — '' is a valid submit; null is cancel). */
  endSummary(taskName: string): Promise<string | null>
  /** Resume with more than one paused task: which block to resume? Returns blockId. */
  pickPausedTask(paused: OpenTaskView[]): Promise<number | null>
  /** Crash recovery for a stranded active block. lastAlive is the heartbeat time (or null). */
  crashRecovery(taskName: string, lastAlive: number | null): Promise<CrashRecoveryChoice | null>
}
