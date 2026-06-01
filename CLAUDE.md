# CLAUDE.md

Local Windows tray app for personal time tracking, triggered by a Stream Deck via a custom protocol handler. Electron + TypeScript + React + Zustand, better-sqlite3 storage. No backend, no cloud. Full spec: `stream-deck-time-tracker-brief.md`.

## Architecture boundaries

- **better-sqlite3 lives in the main process only**, reached exclusively over IPC. Never import it in a preload or renderer. It is a native module — that's *why* the main process is unsandboxed.
- **Renderer stays locked down**: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`. Preload exposes only the minimum IPC surface via `contextBridge`.
- **Triggers are protocol-first.** `timetracker://` registered with `setAsDefaultProtocolClient`; actions dispatched through the single-instance `second-instance` handler. Global hotkeys (F13–F16 via `globalShortcut`) are a *fallback only* — never treat `globalShortcut` as the primary path.
- **The single-instance lock is load-bearing**, not boilerplate: it enforces the "one active block" invariant *and* is the protocol entry point for the already-running app. Don't weaken or bypass it.
- Two `BrowserWindow`s: one reusable multi-mode popup (modes are React components) + the Today's Log window. Plus the tray icon.

## State invariants

- **At most one block has `state='active'` at any time.** Every transition must preserve this.
- **Durations are never silently invented.** On launch, a stranded active block (`state='active'`, `end_time=NULL`) triggers a recovery prompt: Resume / End at last-alive / Discard. A 30–60s heartbeat keeps the last-alive timestamp accurate.
- **A block belongs to the local calendar day of its `start_time`.** Spanning midnight does *not* split it. Compute durations from epoch deltas (DST-safe) — never from wall-clock arithmetic.
- A `paused` or `ended` block always has `end_time` set. Pause/resume creates multiple blocks against one task. Hard deletes only — no soft-delete in v1.

## Security constraints (hard lines)

- **No network listeners. No localhost HTTP server. Ever.** This rules out a full Stream Deck plugin and any IPC-over-socket shortcut.
- **Standard Windows user only** — no UAC elevation, no service component, no scheduled SYSTEM task, no privileged helper.
- **Treat incoming protocol URLs as untrusted.** Validate against the known action set (`newtask`/`endtask`/`pausetask`/`resumetask`/`status`); ignore anything unrecognised. Never path-construct, `eval`, or build queries from URL contents.
- **Parameterise all SQL** (better-sqlite3 prepared statements). No string-built queries.
- **No `dangerouslySetInnerHTML` anywhere.** Rely on React's default escaping.
- **No secrets in the DB** — task names, ticket IDs, free-text notes only.

## Code conventions

- TypeScript throughout. React functional components with hooks. Zustand for state.
- Modern JS: `const`/`let` over `var`; arrow functions over `function` declarations where reasonable.
- **Australian English** in all user-facing strings, comments, and docs (e.g. "centre", "behaviour", "colour").
- Security-conscious by default: prefer the architecturally correct approach over the quick fix.

## Storage & paths

- DB: `%APPDATA%\TimeTracker\timer.db`. Settings: `%APPDATA%\TimeTracker\settings.json`.
- Timestamps are Unix **milliseconds** (integer columns).

## Build & packaging

- `electron-builder`, NSIS **per-user** install (no admin, local appdata). No MSI in v1.
- better-sqlite3 must be rebuilt against Electron's ABI as part of the build (`electron-rebuild` / electron-builder native handling).
- No auto-updater in v1. Code signing deferred until distribution beyond the local machine.
