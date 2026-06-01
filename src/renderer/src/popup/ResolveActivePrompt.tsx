import { useEffect, useRef } from 'react'
import type { ResolveActiveChoice, ResolveActivePayload } from '../../../shared/popup'

// "Pause or end the current task?" shown when New Task is invoked mid-task.
export function ResolveActivePrompt({
  payload,
  onSubmit
}: {
  payload: ResolveActivePayload
  onSubmit: (choice: ResolveActiveChoice) => void
}): React.JSX.Element {
  const pauseRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    pauseRef.current?.focus()
  }, [])

  // p / e shortcuts in addition to Tab + Enter on the buttons.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key.toLowerCase() === 'p') onSubmit('pause')
    else if (event.key.toLowerCase() === 'e') onSubmit('end')
  }

  return (
    <div className="mode" onKeyDown={onKeyDown}>
      <h2 className="mode-title">Switch task</h2>
      <p className="mode-text">
        Pause or end <strong>{payload.taskName}</strong> first?
      </p>
      <div className="buttons">
        <button
          ref={pauseRef}
          className="btn"
          data-testid="resolve-pause"
          onClick={() => onSubmit('pause')}
        >
          Pause
        </button>
        <button className="btn" data-testid="resolve-end" onClick={() => onSubmit('end')}>
          End
        </button>
      </div>
      <div className="hint">P pause · E end · Esc cancel</div>
    </div>
  )
}
