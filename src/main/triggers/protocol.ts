import { resolve } from 'node:path'
import { app } from 'electron'
import { isTriggerAction, type TriggerAction } from '../../shared/actions'

export const PROTOCOL = 'timetracker'

// Register timetracker:// as the default client for this app. In dev the app is
// `electron <project>`, so the registration must point at the electron binary
// plus the script path; in a packaged build the bare form is correct.
export const registerProtocol = (): boolean => {
  if (process.defaultApp) {
    if (process.argv.length < 2) return false
    return app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [resolve(process.argv[1])])
  }
  return app.setAsDefaultProtocolClient(PROTOCOL)
}

export const isProtocolRegistered = (): boolean => {
  if (process.defaultApp) {
    if (process.argv.length < 2) return false
    return app.isDefaultProtocolClient(PROTOCOL, process.execPath, [resolve(process.argv[1])])
  }
  return app.isDefaultProtocolClient(PROTOCOL)
}

export const removeProtocol = (): boolean => {
  if (process.defaultApp) {
    if (process.argv.length < 2) return false
    return app.removeAsDefaultProtocolClient(PROTOCOL, process.execPath, [resolve(process.argv[1])])
  }
  return app.removeAsDefaultProtocolClient(PROTOCOL)
}

/**
 * Resolve a raw protocol URL to a known action, or null. The incoming URL is
 * UNTRUSTED: we only read the scheme and the action token, validate against the
 * closed action set, and never path-construct, eval, or otherwise act on the
 * rest of the URL. Unknown/malformed input returns null (caller surfaces it).
 */
export const parseProtocolUrl = (raw: string): TriggerAction | null => {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== `${PROTOCOL}:`) return null

  // Accept both timetracker://newtask (host) and timetracker:newtask (path).
  const token = (url.hostname || url.pathname.replace(/^\/+/, '').split('/')[0] || '').toLowerCase()
  return isTriggerAction(token) ? token : null
}

/** First timetracker: argument in an argv array (how Windows delivers it). */
export const findProtocolUrl = (argv: readonly string[]): string | null =>
  argv.find((arg) => arg.toLowerCase().startsWith(`${PROTOCOL}:`)) ?? null
