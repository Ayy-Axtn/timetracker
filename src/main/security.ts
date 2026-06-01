import { app, session, shell } from 'electron'

// In dev the renderer is served by Vite over http://localhost with HMR, which
// needs inline/eval and a websocket back to the dev server. We only clamp down
// the CSP for the packaged build, where the renderer loads from file://.
const isDev = (): boolean => !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ')

// Attach a Content-Security-Policy response header to renderer documents in the
// packaged build. There is no remote content ever, so 'self' is the whole world.
export const installContentSecurityPolicy = (): void => {
  if (isDev()) return
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [PROD_CSP]
      }
    })
  })
}

// Defence in depth: no window should ever open a child window or navigate away
// from the app's own content. External links (if any appear later) go to the
// system browser instead of loading inside an Electron window.
export const hardenWebContents = (): void => {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      if (url !== contents.getURL()) event.preventDefault()
    })
  })
}
