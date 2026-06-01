import type { BlockWithTask } from './models'

// Formatting shared by the renderer and the tests so they agree exactly.

/** "1h 15m", "2h", "5m", "0m". Rounds to the nearest minute; never negative. */
export const formatDuration = (ms: number): string => {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours && minutes) return `${hours}h ${minutes}m`
  if (hours) return `${hours}h`
  return `${minutes}m`
}

/** Local clock time, e.g. "09:05" (Australian English, 24-hour). */
export const formatClock = (ts: number): string =>
  new Date(ts).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })

/**
 * A readable plain-text summary of a day's blocks, for copying out as notes /
 * reference while writing time entries by hand. One line per block plus a
 * per-task breakdown and the day total. Durations use `now` for any open block.
 */
export const formatDayExport = (
  blocks: BlockWithTask[],
  opts: { dayMs: number; now: number }
): string => {
  const date = new Date(opts.dayMs).toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  const durationOf = (b: BlockWithTask): number => (b.endTime ?? opts.now) - b.startTime
  const total = blocks.reduce((sum, b) => sum + durationOf(b), 0)

  const rows = blocks.map((b) => {
    const end = b.endTime ? formatClock(b.endTime) : 'now'
    const ticket = b.ticketId ? ` [${b.ticketId}]` : ''
    const note = b.summary ? ` — ${b.summary}` : ''
    return `${formatClock(b.startTime)}–${end}  ${formatDuration(durationOf(b))}  ${b.taskName}${ticket}${note}`
  })

  const byTask = new Map<string, number>()
  for (const b of blocks) byTask.set(b.taskName, (byTask.get(b.taskName) ?? 0) + durationOf(b))
  const breakdown = [...byTask.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([task, ms]) => `  ${task}: ${formatDuration(ms)}`)

  const parts = [`${date} — total ${formatDuration(total)}`, '', rows.length ? rows.join('\n') : '(no blocks)']
  if (breakdown.length) parts.push('', 'By task:', ...breakdown)
  return parts.join('\n')
}
