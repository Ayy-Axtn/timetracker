import { useEffect, useState } from 'react'

// Placeholder Today's Log surface. Its job in this step is to prove the renderer
// is sandboxed yet can still reach the main process — and the database — over
// the preload bridge. The real log lands in step 6.
export default function App(): React.JSX.Element {
  const [version, setVersion] = useState('…')
  const [todayCount, setTodayCount] = useState<number | null>(null)
  const [recentCount, setRecentCount] = useState<number | null>(null)

  useEffect(() => {
    window.api.getAppVersion().then(setVersion).catch(() => setVersion('unknown'))
    window.api.getBlocksForDay().then((b) => setTodayCount(b.length)).catch(() => setTodayCount(null))
    window.api.getRecentTasks().then((t) => setRecentCount(t.length)).catch(() => setRecentCount(null))
  }, [])

  return (
    <main className="app">
      <h1>TimeTracker</h1>
      <p className="subtitle">Today&rsquo;s Log</p>
      <p className="muted">Scaffolding in place — the daily log lands in a later step.</p>
      <dl className="stats">
        <div>
          <dt>Blocks today</dt>
          <dd>{todayCount ?? '—'}</dd>
        </div>
        <div>
          <dt>Recent tasks</dt>
          <dd>{recentCount ?? '—'}</dd>
        </div>
      </dl>
      <footer className="version">v{version}</footer>
    </main>
  )
}
