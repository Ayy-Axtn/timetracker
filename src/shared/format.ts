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
 * Autotask paste line, e.g. "1h 15m | TASK-123 | Investigated login issue".
 * Empty ticket or text segments are dropped rather than left blank.
 */
export const formatClipboardLine = (opts: {
  durationMs: number
  ticketId: string | null
  text: string
}): string =>
  [formatDuration(opts.durationMs), opts.ticketId ?? '', opts.text ?? '']
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' | ')
