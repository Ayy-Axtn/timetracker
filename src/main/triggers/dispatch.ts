import { appendFileSync } from 'node:fs'
import { ACTION_LABELS, type TriggerAction } from '../../shared/actions'
import { notify } from '../notifications'
import { parseProtocolUrl } from './protocol'

export type TriggerSource = 'protocol' | 'hotkey' | 'tray'

/**
 * Central entry point for every trigger, regardless of source. Step 4 replaces
 * the placeholder body with the real state-machine transitions; for now each
 * trigger surfaces a toast so the whole pipeline is observable end to end.
 */
export const dispatchAction = (action: TriggerAction, source: TriggerSource): void => {
  // E2E hook: when set, record dispatches to a file instead of toasting, so the
  // protocol → single-instance → dispatch path can be asserted from a test.
  const sink = process.env['TIMETRACKER_TRIGGER_E2E']
  if (sink) {
    appendFileSync(sink, `${action}:${source}\n`)
    return
  }
  notify(`${ACTION_LABELS[action]} — ${source}`, 'info')
}

/**
 * Handle an incoming protocol URL: dispatch if it resolves to a known action,
 * otherwise surface a toast rather than dropping it silently. The raw URL is
 * never echoed into the toast (untrusted input) — it goes to the log only.
 */
export const handleProtocolActivation = (rawUrl: string, source: TriggerSource = 'protocol'): void => {
  const action = parseProtocolUrl(rawUrl)
  if (action) {
    dispatchAction(action, source)
  } else {
    console.warn(`Ignored unrecognised protocol activation: ${rawUrl}`)
    notify('Ignored an unrecognised trigger.', 'error')
  }
}
