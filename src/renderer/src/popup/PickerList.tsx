import { useEffect, useRef, useState } from 'react'
import type { PickPayload } from '../../../shared/popup'

const formatTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })

// Shared list picker for End Task (open tasks) and Resume Task (paused tasks).
// Arrow keys move the highlight; Enter selects; clicking selects. Returns the
// chosen block's id.
export function PickerList({
  payload,
  onSubmit
}: {
  payload: PickPayload
  onSubmit: (blockId: number) => void
}): React.JSX.Element {
  const [highlight, setHighlight] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    listRef.current?.focus()
  }, [])

  const onKeyDown = (event: React.KeyboardEvent<HTMLUListElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((h) => Math.min(h + 1, payload.tasks.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const task = payload.tasks[highlight]
      if (task) onSubmit(task.blockId)
    }
  }

  return (
    <div className="mode">
      <h2 className="mode-title">{payload.title}</h2>
      <ul
        ref={listRef}
        className="picker"
        data-testid="picker-list"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {payload.tasks.map((task, index) => (
          <li
            key={task.blockId}
            className={`picker-item${index === highlight ? ' highlighted' : ''}`}
            data-testid="picker-item"
            onMouseEnter={() => setHighlight(index)}
            onMouseDown={(e) => {
              e.preventDefault()
              onSubmit(task.blockId)
            }}
          >
            <span className="picker-name">{task.taskName}</span>
            {task.ticketId && <span className="picker-ticket">{task.ticketId}</span>}
            <span className={`picker-state ${task.state}`}>{task.state}</span>
            <span className="picker-time">from {formatTime(task.startTime)}</span>
          </li>
        ))}
      </ul>
      <div className="hint">↑↓ to choose · Enter to select · Esc to cancel</div>
    </div>
  )
}
