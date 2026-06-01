import { useEffect, useState } from 'react'

// Placeholder Today's Log surface. Its only job in the scaffold is to prove the
// renderer is sandboxed yet can still reach the main process over the preload
// bridge. The real log lands in step 6.
export default function App(): React.JSX.Element {
  const [version, setVersion] = useState('…')

  useEffect(() => {
    window.api.getAppVersion().then(setVersion).catch(() => setVersion('unknown'))
  }, [])

  return (
    <main className="app">
      <h1>TimeTracker</h1>
      <p className="subtitle">Today&rsquo;s Log</p>
      <p className="muted">Scaffolding in place — the daily log lands in a later step.</p>
      <footer className="version">v{version}</footer>
    </main>
  )
}
