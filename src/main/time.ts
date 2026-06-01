// Local calendar-day boundaries. A block belongs to the local day of its
// start_time, so day queries use local midnight bounds. Building the bounds
// from local Y/M/D (rather than adding 24h) keeps it correct across DST shifts.
export interface DayBounds {
  start: number
  end: number
}

export const localDayBounds = (referenceMs: number): DayBounds => {
  const d = new Date(referenceMs)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
  return { start, end }
}
