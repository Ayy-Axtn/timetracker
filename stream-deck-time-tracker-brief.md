# Stream Deck Time Tracker: Project Brief (v1, decisions resolved)

## Summary

A local Windows tray application for personal time tracking, triggered by a Stream Deck via a custom protocol handler. Captures discrete work blocks with task name, optional ticket ID, and notes. End-of-day review window provides a daily log to copy into Autotask manually. No backend services, no cloud, no Autotask integration in v1.

Target user: a single developer on a Windows workstation with an Elgato Stream Deck. Opt-in distribution to interested team members via a self-run installer — **not** a fleet-wide org push.

## Architecture

- **Framework:** Electron with TypeScript
- **UI layer:** React with functional components and hooks
- **State management:** Zustand (or React context if simpler suffices)
- **Local storage:** better-sqlite3 (synchronous SQLite bindings)
- **Database location:** `%APPDATA%\TimeTracker\timer.db`
- **Settings file:** `%APPDATA%\TimeTracker\settings.json`
- **IPC:** Electron's native `ipcMain`/`ipcRenderer` between main and renderer. No HTTP server, no localhost port, no network listeners of any kind.
- **Stream Deck integration:** Custom protocol handler (`timetracker://`) registered via `setAsDefaultProtocolClient`. Stream Deck buttons use the "System: Open" action to fire protocol URLs. Global hotkeys (F13–F16) retained as an optional fallback trigger.
- **Privilege level:** Runs as standard Windows user. No UAC elevation, no Windows service component, no privileged helper.

### Trigger model

**Primary: custom protocol.** Each Stream Deck button opens a protocol URL. The app registers `timetracker://` as a default protocol client. When already running (the normal case), activation routes through the single-instance `second-instance` handler, which parses the URL and dispatches the action. This avoids the silent-failure and key-theft fragility of global hotkeys and survives other apps grabbing keys.

| Protocol URL | Action |
|--------------|--------|
| `timetracker://newtask` | New Task |
| `timetracker://endtask` | End Task |
| `timetracker://pausetask` | Pause Task |
| `timetracker://resumetask` | Resume Task |

**Fallback: global hotkeys.** F13–F16 registered via `globalShortcut`, mappable in settings, for users who prefer keys or whose protocol activation misbehaves. Registration success is checked per-key; any failure is surfaced (see Trigger feedback below) rather than failing silently.

| Key | Action |
|-----|--------|
| F13 | New Task |
| F14 | End Task |
| F15 | Pause Task |
| F16 | Resume Task |

**Trigger feedback.** State-change toasts (see Settings) double as the trigger-health surface: on launch, any hotkey that failed to register raises a toast, and the tray icon reflects an error state. Protocol activation that can't be parsed produces a toast rather than a silent drop.

## Behaviour: state machine

### State model

- **Active slot:** 0 or 1 task currently running
- **Paused pool:** 0 to many tasks paused, retaining accumulated elapsed time
- **Ended pool:** completed tasks for today's log

A "task" is a uniquely identified work item (name + optional ticket ID + notes). A task is composed of one or more "blocks", which are contiguous time periods. Pausing and resuming a task creates multiple blocks against the same task.

### Single-instance lock

`requestSingleInstanceLock()` is enabled. A second launch focuses the first instance's Today's Log window and exits. This is load-bearing for the "at most one active block" invariant and is also the entry point for protocol activation of the running app.

### Crash recovery

A heartbeat writes a last-alive timestamp (every 30–60s) while a block is active. On launch, if a block is found with `state='active'` and `end_time=NULL` (i.e. the app died mid-block), the app prompts:

> "You had '\<task\>' running when the app last closed."
> Options: **Resume** / **End at \<last-alive time\>** / **Discard**

No durations are silently invented — the user always confirms. The heartbeat makes the suggested end-time accurate rather than falling back to the block start.

### Transitions

**New Task (`timetracker://newtask` / F13)**

1. If a task is currently active:
   - Show prompt: "Pause or End current task '\<name\>'?"
   - On user choice, execute that resolution
2. Show New Task popup with fields:
   - Task name (required, autofocused)
   - Ticket ID (optional)
   - Notes (optional)
3. Popup shows recent task names below the name field for arrow-key selection / fuzzy filtering
4. Enter submits, Esc cancels
5. On submit: create new task and a new active block, timestamp start

**End Task (`timetracker://endtask` / F14)**

1. Count open tasks (active + paused):
   - If exactly 1: end it directly
   - If more than 1: show picker popup listing all open tasks, user selects which to end
2. Show closing popup asking for end-of-task summary (optional, can submit empty)
3. Mark the block as ended with end timestamp and summary

**Pause Task (`timetracker://pausetask` / F15)**

1. If a task is active: pause it (block state → paused, preserve elapsed)
2. If no active task: silent no-op (or quick toast "No active task")

**Resume Task (`timetracker://resumetask` / F16)**

1. If no paused tasks: silent no-op
2. If exactly 1 paused task:
   - If a task is currently active, auto-pause it first
   - Resume the paused task (create new block with state=active for the same task)
3. If multiple paused tasks:
   - Show picker popup listing paused tasks
   - User selects
   - If a task is currently active, auto-pause it first
   - Resume the selected task

## UI: windows

Two distinct Electron `BrowserWindow` instances plus the tray icon.

### Popup window (multi-purpose)

A single reusable window for all transient prompts. Different "modes" rendered as different React components within it.

- Frameless or minimal chrome (close button only)
- Positioned per the `popupPosition` setting; default near cursor, **clamped to screen bounds** so a cursor near a screen edge never pushes the popup off-screen. Alternative `activeMonitorCentre` mode available.
- Always-on-top, steals focus aggressively when shown
- Hidden by default, shown on demand
- Keyboard-first throughout: Enter submits, Esc cancels, Tab between fields, arrow keys navigate recent-tasks list

Modes:
- New Task entry (name + ticket ID + notes + recent-tasks autocomplete)
- Pause-or-End prompt (two buttons + current task name display)
- End Task picker (list of open tasks, selectable)
- End Task summary (single notes field)
- Resume Task picker (list of paused tasks, selectable)
- Crash-recovery prompt (Resume / End at last-alive / Discard)

### Today's Log window

- Opened from tray menu
- Standard window chrome (titlebar, minimise, close)
- Lists all blocks for today by default, with date picker to navigate previous days
- A block belongs to the local calendar day of its `start_time`; a block spanning midnight stays wholly on its start day and is not split. Durations are computed from epoch deltas (DST-safe).
- Columns: Start, End, Duration, Task name, Ticket ID, Notes/Summary
- Inline editable: task name, ticket ID, notes, summary
- Block operations:
  - Back-date: manually create a block for time forgotten to track
  - Merge: combine two adjacent blocks (same task) into one
  - Split: split a block at a chosen timestamp
  - Delete: remove a block (hard delete)
- Export day: copy the whole day's log to the clipboard as a readable plain-text summary (one line per block — time range, duration, task, ticket, notes — plus a per-task breakdown and total). Used as reference for writing Autotask time-entry descriptions by hand; the app is a timer + notes pad, so per-block Autotask-formatted copy was dropped (it only partially filled the time-entry template).
- Daily totals at the bottom (total tracked, breakdown by task)

### Tray icon

- Always present in Windows system tray
- Icon reflects state: idle (grey), active (green), paused (amber), trigger error (distinct error state)
- Tooltip: current task name and elapsed time if active
- Left-click: opens Today's Log
- Right-click menu:
  - Open Today's Log
  - Pause Task (hardware-independent backup)
  - Resume Task (backup, only enabled if paused tasks exist)
  - Settings
  - Quit

## Database schema

```sql
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ticket_id TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL  -- Unix timestamp in milliseconds
);

CREATE TABLE blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  start_time INTEGER NOT NULL,  -- Unix timestamp in milliseconds
  end_time INTEGER,             -- NULL while active or paused
  state TEXT NOT NULL,          -- 'active' | 'paused' | 'ended'
  summary TEXT,                 -- end-of-block notes
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX idx_blocks_state ON blocks(state);
CREATE INDEX idx_blocks_start_time ON blocks(start_time);
CREATE INDEX idx_blocks_task_id ON blocks(task_id);
```

Invariants:
- At most one block has `state = 'active'` at any time
- A block with `state = 'paused'` or `'ended'` has `end_time` set
- An ended block can be the only block for a task; multiple blocks per task occur on pause/resume cycles
- Hard deletes for v1, no soft-delete

**DB access boundary:** better-sqlite3 is a native module and is loaded only in the main process, reached exclusively over IPC. It is never imported in a preload or renderer, and the main process is therefore not sandboxed (see Security).

## Settings

Stored in `%APPDATA%\TimeTracker\settings.json`:

```json
{
  "launchAtStartup": true,
  "showStateToasts": true,
  "triggers": {
    "protocolEnabled": true,
    "hotkeysEnabled": true,
    "hotkeys": {
      "newTask": "F13",
      "endTask": "F14",
      "pauseTask": "F15",
      "resumeTask": "F16"
    }
  },
  "popupPosition": "cursor",
  "recentTasksWindowDays": 14
}
```

- `launchAtStartup` defaults true, toggleable in tray/settings.
- Hotkey overrides are validated against successful `globalShortcut.register` before being persisted, so a user cannot lock themselves out with an unregisterable combination.
- `popupPosition` is `"cursor"` (default, clamped) or `"activeMonitorCentre"`.

## Security constraints

- Standard user only, no elevation prompts
- No network listeners, no localhost HTTP server
- No Windows service component, no scheduled tasks running as SYSTEM
- Parameterise all SQL (better-sqlite3 prepared statements)
- React handles text escaping by default; verify no `dangerouslySetInnerHTML` anywhere
- Protocol URL parsing treats the incoming URL as untrusted input: validate against the known action set, ignore anything unrecognised, never `eval` or path-construct from it
- No secrets in the database: task names, ticket IDs, free-text notes only. Users should not put credentials in notes.
- Electron security defaults:
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: true` in the renderer; **main process is unsandboxed** because better-sqlite3 (native) loads there
  - Preload scripts expose only the minimum IPC surface needed

## Distribution

- Build tool: `electron-builder`
- Output: **NSIS .exe, per-user install** (no admin, installs to local appdata). MSI dropped from v1 — reconsider only if this ever goes fleet-wide.
- Bundle size: ~80–150MB
- No external runtime dependencies (Electron, Node, Chromium all bundled)
- better-sqlite3 rebuilt against Electron's ABI as part of the build (electron-builder native handling / `electron-rebuild`)
- Database initialised on first launch in `%APPDATA%\TimeTracker\`
- `timetracker://` protocol registered on install
- Stream Deck profile (`.streamDeckProfile`) shipped alongside the installer for one-click import; buttons use **System: Open** actions pointing at the `timetracker://` URLs
- Launch at startup registered by default; toggle in tray/settings
- Auto-updater: not in v1; new versions are reinstalled manually
- Code signing: deferred until distribution beyond local machine; internal CA-issued cert when needed

## Out of scope for v1

- Autotask API integration (manual copy-paste instead)
- Cloud sync, multi-device, multi-user
- Reporting beyond a single day's log
- Categories, tags, clients as structured fields
- Calendar integration, idle detection, automatic pausing
- Auto-update mechanism
- A full Stream Deck plugin with on-button live state (considered, deferred — bigger build, needs a plugin-to-app channel that cuts against the no-network stance)

## Suggested build order

1. Electron scaffolding: main process, renderer, IPC plumbing, tray icon, settings load/save, single-instance lock
2. Database layer: schema migration, repository functions for tasks and blocks
3. Trigger layer: `timetracker://` protocol registration + `second-instance` URL dispatch; global-hotkey fallback with registration-success checks; trigger-failure surfacing
4. State machine: implement transitions + crash-recovery reconciliation, unit tests per transition
5. Popup window: New Task mode first, then End/Resume picker modes, then crash-recovery prompt
6. Today's Log window: read-only listing, then editable inline, then block operations
7. Polish: tray icon states, toasts, settings UI, popup positioning + edge clamp
8. Packaging: electron-builder NSIS config, per-user install, Stream Deck profile, protocol registration

## Tech stack summary

| Layer | Choice |
|-------|--------|
| Shell | Electron (latest stable) |
| Language | TypeScript |
| UI | React with hooks |
| State | Zustand |
| Storage | better-sqlite3 (main process only) |
| Build | electron-builder |
| Packaging | NSIS .exe, per-user |
| Stream Deck trigger | Custom protocol `timetracker://` (primary), global hotkeys F13–F16 (fallback) |
