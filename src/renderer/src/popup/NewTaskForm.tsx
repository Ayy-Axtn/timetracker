import { useMemo, useRef, useState } from 'react'
import type { NewTaskInput, Task } from '../../../shared/models'
import type { NewTaskPayload } from '../../../shared/popup'
import { AutoTextarea } from './AutoTextarea'

// Subsequence fuzzy match: every character of the query appears, in order.
const fuzzy = (query: string, text: string): boolean => {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  let i = 0
  for (const ch of t) {
    if (ch === q[i]) i += 1
    if (i === q.length) return true
  }
  return q.length === 0
}

export function NewTaskForm({
  payload,
  onSubmit
}: {
  payload: NewTaskPayload
  onSubmit: (result: NewTaskInput) => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [ticketId, setTicketId] = useState('')
  const [notes, setNotes] = useState('')
  // -1 = focus is in the name field; >= 0 = a recent item is highlighted.
  const [highlight, setHighlight] = useState(-1)
  const nameRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(
    () => payload.recent.filter((t) => fuzzy(name, t.name) || fuzzy(name, t.ticketId ?? '')),
    [payload.recent, name]
  )

  const submitTyped = (): void => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit({ name: trimmed, ticketId: ticketId.trim() || null, notes: notes.trim() || null })
  }

  const submitRecent = (task: Task): void => {
    onSubmit({ name: task.name, ticketId: task.ticketId, notes: null })
  }

  const onNameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((h) => Math.min(h + 1, matches.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((h) => Math.max(h - 1, -1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (highlight >= 0 && matches[highlight]) submitRecent(matches[highlight])
      else submitTyped()
    }
  }

  return (
    <div className="mode">
      <h2 className="mode-title">New task</h2>
      <input
        ref={nameRef}
        className="field"
        data-testid="newtask-name"
        placeholder="Task name"
        autoFocus
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setHighlight(-1)
        }}
        onKeyDown={onNameKeyDown}
      />
      {matches.length > 0 && (
        <ul className="recent" data-testid="recent-list">
          {matches.map((task, index) => (
            <li
              key={task.id}
              className={`recent-item${index === highlight ? ' highlighted' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                submitRecent(task)
              }}
            >
              <span className="recent-name">{task.name}</span>
              {task.ticketId && <span className="recent-ticket">{task.ticketId}</span>}
            </li>
          ))}
        </ul>
      )}
      <input
        className="field"
        data-testid="newtask-ticket"
        placeholder="Reference (optional)"
        value={ticketId}
        onChange={(e) => setTicketId(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submitTyped()}
      />
      <AutoTextarea
        className="field"
        data-testid="newtask-notes"
        placeholder="Notes (optional)"
        rows={2}
        value={notes}
        onChange={setNotes}
        onKeyDown={(e) => {
          // Enter starts the task (as the hint promises); Shift+Enter adds a
          // newline. Without this, Enter in the notes field did nothing.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submitTyped()
          }
        }}
      />
      <div className="hint">Enter to start · ↑↓ recent · Shift+Enter for a new line · Esc to cancel</div>
    </div>
  )
}
