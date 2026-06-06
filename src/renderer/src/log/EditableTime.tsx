import { useEffect, useState } from 'react'
import { formatClock } from '../../../shared/format'

// Click-to-edit clock cell, mirroring EditableText for the Start/End columns.
// Click shows an HH:MM time input; Enter or blur commits (only if changed), Esc
// reverts. The chosen time is applied to the existing calendar date of valueMs,
// so editing a time never moves a block to another day (nor across midnight).
const hhmm = (ms: number): string => {
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function EditableTime({
  valueMs,
  testid,
  onCommit
}: {
  valueMs: number
  testid?: string
  onCommit: (nextMs: number) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => hhmm(valueMs))

  useEffect(() => {
    if (!editing) setDraft(hhmm(valueMs))
  }, [valueMs, editing])

  const commit = (): void => {
    setEditing(false)
    if (draft === hhmm(valueMs)) return
    const [h, m] = draft.split(':').map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return
    const d = new Date(valueMs)
    d.setHours(h, m, 0, 0)
    onCommit(d.getTime())
  }

  if (!editing) {
    return (
      <span className="cell-text mono" data-testid={testid} onClick={() => setEditing(true)}>
        {formatClock(valueMs)}
      </span>
    )
  }

  return (
    <input
      type="time"
      className="cell-input time"
      data-testid={testid ? `${testid}-input` : undefined}
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setDraft(hhmm(valueMs))
          setEditing(false)
        }
      }}
    />
  )
}
