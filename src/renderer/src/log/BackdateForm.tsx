import { useState } from 'react'
import type { BackdateInput } from '../../../shared/models'

// Combine the viewed day with an HH:MM time into an epoch millisecond value.
const combine = (dayMs: number, time: string): number => {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(dayMs)
  d.setHours(h || 0, m || 0, 0, 0)
  return d.getTime()
}

// Manually add a block for time that wasn't tracked, on the day being viewed.
export function BackdateForm({
  dayMs,
  onSubmit,
  onCancel
}: {
  dayMs: number
  onSubmit: (input: BackdateInput) => void
  onCancel: () => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [ticketId, setTicketId] = useState('')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [summary, setSummary] = useState('')
  const [error, setError] = useState('')

  const submit = (): void => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Task name is required.')
      return
    }
    const startTime = combine(dayMs, start)
    const endTime = combine(dayMs, end)
    if (endTime <= startTime) {
      setError('End must be after start.')
      return
    }
    onSubmit({
      name: trimmed,
      ticketId: ticketId.trim() || null,
      startTime,
      endTime,
      summary: summary.trim() || null
    })
  }

  return (
    <div className="backdate" data-testid="backdate-form">
      <div className="backdate-row">
        <input
          className="field"
          data-testid="backdate-name"
          placeholder="Task name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="field"
          placeholder="Reference"
          value={ticketId}
          onChange={(e) => setTicketId(e.target.value)}
        />
        <input className="field time" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        <span className="dash">–</span>
        <input className="field time" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <div className="backdate-row">
        <input
          className="field grow"
          placeholder="Summary (optional)"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
        <button className="btn primary" data-testid="backdate-submit" onClick={submit}>
          Add
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && <div className="backdate-error">{error}</div>}
    </div>
  )
}
