import type { BlockWithTask } from './models'

// Formatting shared by the renderer and the tests so they agree exactly.

/**
 * Adaptive duration: seconds under a minute ("45s"), whole minutes under an
 * hour ("15m"), hours and minutes beyond ("1h 15m" / "2h"). Never negative.
 * Truncates (counts up) rather than rounding, so a live timer reads naturally.
 */
export const formatDuration = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const totalMinutes = Math.floor(totalSeconds / 60)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`
}

/** Local clock time, e.g. "09:05" (Australian English, 24-hour). */
export const formatClock = (ts: number): string =>
  new Date(ts).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })

/** Local date as YYYY-MM-DD (sorts cleanly in spreadsheets). */
export const isoDate = (ts: number): string => {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Quote a CSV field only when it contains a comma, quote, or newline.
const csvField = (value: string): string => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

/**
 * A day's blocks as CSV (one row per block) for export to a spreadsheet or
 * time-entry tool. Hours is a decimal (e.g. 1.25) for billing maths; an open
 * block's End is blank and its Hours counts up to `now`. CRLF line endings for
 * Excel friendliness.
 */
export const formatDayCsv = (blocks: BlockWithTask[], opts: { now: number }): string => {
  const header = ['Date', 'Start', 'End', 'Hours', 'Task', 'Reference', 'Summary']
  const rows = blocks.map((b) => {
    const hours = ((b.endTime ?? opts.now) - b.startTime) / 3_600_000
    return [
      isoDate(b.startTime),
      formatClock(b.startTime),
      b.endTime ? formatClock(b.endTime) : '',
      hours.toFixed(2),
      b.taskName,
      b.ticketId ?? '',
      b.summary ?? ''
    ]
      .map(csvField)
      .join(',')
  })
  return [header.join(','), ...rows].join('\r\n')
}
