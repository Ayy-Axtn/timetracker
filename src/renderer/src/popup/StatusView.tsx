import { useEffect, useState } from 'react'
import type { StatusPayload } from '../../../shared/popup'
import { formatClock, formatDuration } from '../../../shared/format'

// Read-only quick view of the current active + paused tasks. Esc or Close
// dismisses it; the active task's elapsed time ticks while open.
export function StatusView({
  payload,
  onClose
}: {
  payload: StatusPayload
  onClose: () => void
}): React.JSX.Element {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="mode">
      <h2 className="mode-title">Quick view</h2>

      <div className="status-section">
        <div className="status-label">Active</div>
        {payload.active ? (
          <div className="status-item" data-testid="status-active">
            <span className="status-name">{payload.active.taskName}</span>
            {payload.active.ticketId && <span className="status-ticket">{payload.active.ticketId}</span>}
            <span className="status-elapsed">{formatDuration(now - payload.active.startTime)}</span>
          </div>
        ) : (
          <div className="status-empty">No active task</div>
        )}
      </div>

      <div className="status-section">
        <div className="status-label">Paused ({payload.paused.length})</div>
        {payload.paused.length > 0 ? (
          <ul className="status-list">
            {payload.paused.map((task) => (
              <li key={task.blockId} className="status-item">
                <span className="status-name">{task.taskName}</span>
                {task.ticketId && <span className="status-ticket">{task.ticketId}</span>}
                <span className="status-since">since {formatClock(task.startTime)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="status-empty">No paused tasks</div>
        )}
      </div>

      <div className="buttons">
        <button className="btn" data-testid="status-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
