import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir } from '../paths'

// While a block is active, a heartbeat records a last-alive timestamp every
// ~45s (within the brief's 30–60s window). If the app dies mid-block, the file
// survives and gives crash recovery an accurate suggested end time instead of
// falling back to the block's start. The file is removed when nothing is active.

const INTERVAL_MS = 45_000
const heartbeatPath = (): string => join(dataDir(), 'heartbeat')

let timer: ReturnType<typeof setInterval> | null = null

export const writeHeartbeat = (ts = Date.now()): void => {
  try {
    mkdirSync(dataDir(), { recursive: true })
    writeFileSync(heartbeatPath(), String(ts), 'utf-8')
  } catch {
    // A failed heartbeat is non-fatal — recovery falls back to the block start.
  }
}

export const readHeartbeat = (): number | null => {
  try {
    const value = Number(readFileSync(heartbeatPath(), 'utf-8').trim())
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

export const clearHeartbeat = (): void => {
  try {
    rmSync(heartbeatPath(), { force: true })
  } catch {
    // ignore
  }
}

export const startHeartbeat = (): void => {
  // Idempotent: if already ticking, just refresh the timestamp.
  if (timer) {
    writeHeartbeat()
    return
  }
  writeHeartbeat()
  timer = setInterval(() => writeHeartbeat(), INTERVAL_MS)
}

export const stopHeartbeat = (): void => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
