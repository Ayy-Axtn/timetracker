import { appendFileSync } from 'node:fs'
import type { TriggerAction } from '../../shared/actions'
import { notify } from '../notifications'
import { runAction } from '../state/runner'
import { parseProtocolUrl } from './protocol'

export type TriggerSource = 'protocol' | 'hotkey' | 'tray'

/**
 * Central entry point for every trigger, regardless of source. Hands off to the
 * state machine runner, which serialises transitions. Fire-and-forget: the
 * caller (a hotkey/protocol/tray event) doesn't await the transition.
 */
export const dispatchAction = (action: TriggerAction, source: TriggerSource): void => {
  // E2E hook: when set, record dispatches to a file instead of running them, so
  // the protocol → single-instance → dispatch path can be asserted from a test.
  const sink = process.env['TIMETRACKER_TRIGGER_E2E']
  if (sink) {
    appendFileSync(sink, `${action}:${source}\n`)
    return
  }
  void runAction(action)
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
