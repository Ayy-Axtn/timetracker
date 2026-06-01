# Build Plan — progress checklist

> Living checklist. Tick items as you complete them and use it to re-orient at the
> start of each session. This tracks *progress*, not design — the brief
> (`stream-deck-time-tracker-brief.md`) remains the source of truth. If the two ever
> disagree, the brief wins; fix this file to match.

---

## 1. Electron scaffolding

Foundation for everything else — start here.

- [x] Electron + TypeScript + React project scaffold builds and runs an empty window
- [x] Main process bootstraps; renderer loads with `contextIsolation: true`, `nodeIntegration: false`, renderer `sandbox: true`
- [x] Preload script wired with `contextBridge`, exposing a minimal (placeholder) IPC surface
- [x] `requestSingleInstanceLock()` enabled; second launch focuses first instance and exits
- [x] Tray icon appears with right-click menu (Open Today's Log, Pause, Resume, Settings, Quit) and left-click handler
- [x] Settings load/save against `%APPDATA%\TimeTracker\settings.json` with defaults from the brief

**Done when:** the app launches to a tray icon, enforces single-instance, and reads/writes settings.json.

## 2. Database layer

Depends on: step 1 (main process + IPC plumbing).

- [x] DB initialised on first launch at `%APPDATA%\TimeTracker\timer.db`
- [x] Schema migration creates `tasks` and `blocks` tables plus the three indexes
- [x] Repository functions for tasks (create, fetch recent within `recentTasksWindowDays`)
- [x] Repository functions for blocks (create, end, pause, query by day, edit fields, delete)
- [x] All queries use parameterised prepared statements; better-sqlite3 imported in main process only
- [x] better-sqlite3 rebuilt against Electron's ABI so it loads in the packaged/dev runtime

**Done when:** the schema is created on first launch and tasks/blocks can be created and read back over IPC.

## 3. Trigger layer

Depends on: step 1 (single-instance lock) and step 2 (so actions can touch state).

- [x] `timetracker://` registered via `setAsDefaultProtocolClient`
- [x] `second-instance` handler parses the protocol URL and dispatches the action (primary path)
- [x] URL parsing validates against the known action set (`newtask`/`endtask`/`pausetask`/`resumetask`); unrecognised input ignored with a toast, never path-constructed or eval'd
- [x] Global hotkeys F13–F16 registered via `globalShortcut` as fallback, mappable in settings
- [x] Per-key registration success checked; any failure surfaced via toast + tray error state (no silent failure)
- [x] Hotkey overrides validated against successful `globalShortcut.register` before being persisted

**Done when:** all four actions fire via protocol URLs through the single-instance handler, with hotkeys working as fallback and registration failures surfaced.

## 4. State machine

Depends on: step 2 (block/task repositories) and step 3 (triggers to drive transitions).

- [x] New Task transition: prompt-on-active resolution, create task + active block
- [x] End Task transition: 1-vs-many open-task handling, capture summary, mark block ended
- [x] Pause Task transition: active → paused preserving elapsed; no-op when nothing active
- [x] Resume Task transition: 0/1/many paused handling, auto-pause active first, new active block
- [x] "At most one active block" invariant enforced across all transitions
- [x] Heartbeat writes last-alive timestamp every 30–60s while a block is active
- [x] Crash-recovery reconciliation on launch: detect stranded `active`/`end_time=NULL` block, prompt Resume / End at last-alive / Discard (never invent durations)
- [x] Unit tests per transition

**Done when:** every transition behaves per the brief with the single-active invariant held, and a mid-block crash is reconciled on next launch.

## 5. Popup window

Depends on: step 4 (transitions to invoke) and step 1 (window/IPC plumbing). Build modes in this order.

- [x] Reusable frameless always-on-top popup window, hidden by default, steals focus when shown
- [x] New Task mode: name (required, autofocused) + ticket ID + notes + recent-tasks autocomplete (arrow/fuzzy)
- [x] End Task picker + End Task summary modes
- [x] Resume Task picker mode
- [x] Pause-or-End prompt mode
- [x] Crash-recovery prompt mode
- [x] Keyboard-first throughout: Enter submits, Esc cancels, Tab between fields, arrows navigate lists

**Done when:** every transition that needs UI has a working popup mode, all keyboard-driven.

## 6. Today's Log window

Depends on: step 2 (block queries) and step 1 (window plumbing). Build read → edit → operations.

- [x] Read-only listing of today's blocks (Start, End, Duration, Task, Ticket ID, Notes/Summary), opened from tray
- [x] Date picker to navigate previous days; day membership by `start_time`, midnight-spanning blocks not split, durations from epoch deltas
- [x] Inline editing of task name, ticket ID, notes, summary
- [x] Block operations: back-date (create), merge adjacent same-task, split at timestamp, delete (hard)
- [x] Copy-to-clipboard per block formatted for Autotask paste
- [x] Daily totals at bottom (total tracked + breakdown by task)

**Done when:** today and prior days can be viewed, blocks edited and operated on, and rows copied in Autotask format.

## 7. Polish

Depends on: steps 5–6 (popup + log) and step 3 (trigger feedback surface).

- [x] Tray icon reflects state: idle (grey), active (green), paused (amber), trigger error
- [x] Tray tooltip shows current task name + elapsed when active
- [x] State-change toasts wired to the `showStateToasts` setting (double as trigger-health surface)
- [x] Settings UI: launch-at-startup, toasts, trigger enables + hotkey mapping, popup position
- [x] Popup positioning per `popupPosition` (`cursor` clamped to screen bounds, or `activeMonitorCentre`)

**Done when:** state is legible from the tray, toasts/settings work, and the popup positions correctly without going off-screen.

## 8. Packaging

Depends on: a working app (steps 1–7) and step 2's ABI rebuild.

- [ ] electron-builder NSIS config, per-user install (no admin, local appdata)
- [ ] `timetracker://` protocol registered on install
- [ ] DB initialised on first launch of the installed build
- [ ] Launch-at-startup registered by default, toggleable
- [ ] Stream Deck profile (`.streamDeckProfile`) shipped alongside, buttons using System: Open → `timetracker://` URLs
- [ ] Installer produces a runnable per-user app with working protocol triggers end-to-end

**Done when:** a per-user installer builds, installs without admin, registers the protocol, and the Stream Deck profile drives the installed app.
