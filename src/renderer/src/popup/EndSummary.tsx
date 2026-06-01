import { useState } from 'react'
import type { EndSummaryPayload } from '../../../shared/popup'

// Optional closing note when ending a task. Enter submits (empty is allowed);
// Shift+Enter inserts a newline.
export function EndSummary({
  payload,
  onSubmit
}: {
  payload: EndSummaryPayload
  onSubmit: (summary: string) => void
}): React.JSX.Element {
  const [summary, setSummary] = useState('')

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSubmit(summary)
    }
  }

  return (
    <div className="mode">
      <h2 className="mode-title">End {payload.taskName}</h2>
      <textarea
        className="field"
        data-testid="summary-input"
        placeholder="Closing note (optional)"
        autoFocus
        rows={3}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="buttons">
        <button className="btn primary" data-testid="summary-submit" onClick={() => onSubmit(summary)}>
          End task
        </button>
      </div>
      <div className="hint">Enter to finish · Shift+Enter for a new line · Esc to cancel</div>
    </div>
  )
}
