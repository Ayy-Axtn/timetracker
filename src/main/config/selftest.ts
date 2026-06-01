import { writeFileSync } from 'node:fs'
import { computePopupBounds } from '../popup/popup'
import { formatTrayTooltip } from '../tray'

// Unit tests for the pure polish helpers: popup positioning maths and the tray
// tooltip text. Guarded by TIMETRACKER_CONFIG_SELFTEST.

const checks: { label: string; ok: boolean }[] = []
const check = (label: string, ok: boolean): void => {
  checks.push({ label, ok })
}

const report = (result: { ok: boolean; checks: typeof checks; error?: string }): void => {
  const out = process.env['TIMETRACKER_CONFIG_SELFTEST_OUT']
  if (out) writeFileSync(out, JSON.stringify(result, null, 2), 'utf-8')
  else for (const c of result.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}`)
}

export const runConfigSelfTest = (): boolean => {
  try {
    execute()
    const ok = checks.every((c) => c.ok)
    report({ ok, checks })
    return ok
  } catch (err) {
    report({ ok: false, checks, error: err instanceof Error ? (err.stack ?? err.message) : String(err) })
    return false
  }
}

const PRIMARY = { x: 0, y: 0, width: 1920, height: 1080 }

const execute = (): void => {
  // --- popup positioning: active-monitor-centre ---
  const centred = computePopupBounds({ position: 'activeMonitorCentre', cursor: { x: 0, y: 0 }, workArea: PRIMARY, width: 420, height: 200 })
  check('centre: horizontally centred', centred.x === 750)
  check('centre: vertically centred', centred.y === 440)

  // --- popup positioning: cursor, clamped ---
  const free = computePopupBounds({ position: 'cursor', cursor: { x: 100, y: 100 }, workArea: PRIMARY, width: 420, height: 200 })
  check('cursor: away from edges is unclamped', free.x === 100 && free.y === 100)

  const rightEdge = computePopupBounds({ position: 'cursor', cursor: { x: 1900, y: 100 }, workArea: PRIMARY, width: 420, height: 200 })
  check('cursor: clamped off the right edge', rightEdge.x === 1500)

  const bottomEdge = computePopupBounds({ position: 'cursor', cursor: { x: 100, y: 1070 }, workArea: PRIMARY, width: 420, height: 200 })
  check('cursor: clamped off the bottom edge', bottomEdge.y === 880)

  // --- popup positioning: secondary monitor (offset work area) ---
  const secondary = { x: 1920, y: 0, width: 1920, height: 1080 }
  const onSecondary = computePopupBounds({ position: 'cursor', cursor: { x: 1920, y: 0 }, workArea: secondary, width: 420, height: 200 })
  check('cursor: clamped to the secondary monitor lower bound', onSecondary.x === 1920 && onSecondary.y === 0)

  // --- tray tooltip ---
  check(
    'tooltip: active shows task + elapsed',
    formatTrayTooltip('active', 'Build feature', 75 * 60_000) === 'TimeTracker — Build feature (1h 15m)'
  )
  check('tooltip: idle', formatTrayTooltip('idle') === 'TimeTracker — idle')
  check('tooltip: paused', formatTrayTooltip('paused') === 'TimeTracker — paused')
  check('tooltip: error', formatTrayTooltip('error') === 'TimeTracker — trigger error')
}
