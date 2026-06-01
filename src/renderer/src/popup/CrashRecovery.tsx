import { useEffect, useRef } from 'react'
import type { CrashRecoveryChoice, CrashRecoveryPayload } from '../../../shared/popup'

const formatTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })

// Shown on launch when a block was left active (crash or quit-while-running).
// Durations are never invented: ending uses the heartbeat's last-alive time.
export function CrashRecovery({
  payload,
  onSubmit
}: {
  payload: CrashRecoveryPayload
  onSubmit: (choice: CrashRecoveryChoice) => void
}): React.JSX.Element {
  const resumeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    resumeRef.current?.focus()
  }, [])

  const endLabel = payload.lastAlive ? `End at ${formatTime(payload.lastAlive)}` : 'End at start'

  return (
    <div className="mode">
      <h2 className="mode-title">Recover session</h2>
      <p className="mode-text">
        You had <strong>{payload.taskName}</strong> running when the app last closed.
      </p>
      <div className="buttons column">
        <button ref={resumeRef} className="btn" data-testid="recovery-resume" onClick={() => onSubmit('resume')}>
          Resume
        </button>
        <button className="btn" data-testid="recovery-end" onClick={() => onSubmit('end')}>
          {endLabel}
        </button>
        <button className="btn danger" data-testid="recovery-discard" onClick={() => onSubmit('discard')}>
          Discard
        </button>
      </div>
    </div>
  )
}
