<img src="resources/icon.png" width="96" align="right" alt="TimeTracker icon" />

# TimeTracker

A local Windows tray app for personal time tracking, triggered by an Elgato
Stream Deck via a custom `timetracker://` protocol. Capture discrete work blocks
(task name, optional ticket ID, notes), review them in a daily log, and export a
CSV to write your time entries from. No backend, no cloud, no network listeners.

## Features

- **Stream Deck / hotkey triggers** — New, End, Pause, Resume, and a read-only
  Quick View, via `timetracker://` URLs (primary) or global hotkeys F13–F17.
- **Keyboard-first popups** — New Task (with recent-task autocomplete), task
  pickers, end-of-task summary, and crash recovery.
- **Tray** — state-coloured stopwatch icon (idle / active / paused / error) with
  a live elapsed tooltip; Pause/Resume/Quick View/Settings from the menu.
- **Today's Log** — editable daily log with inline edits, back-date, merge,
  split, delete, daily totals, and a CSV day export.
- **Crash-safe** — a heartbeat lets the app reconcile a session left running
  (Resume / End at last-alive / Discard); durations are never invented.
- **Settings** — launch-at-startup, notifications, trigger toggles, hotkey
  remapping (validated before saving), popup position.

## Install

Download `TimeTracker-<version>-setup.exe` from the
[Releases](../../releases) page and run it. It's a **per-user** install — no
admin required; it installs to `%LOCALAPPDATA%\Programs\timetracker`, registers
`timetracker://` on first launch, and adds itself to startup (toggle in
Settings). Data lives in `%APPDATA%\TimeTracker\`.

The installer is currently **unsigned**, so Windows SmartScreen may warn on
first run — choose *More info → Run anyway*.

### Stream Deck

Bind buttons to the `timetracker://` URLs (or F13–F17). See
[`streamdeck/README.md`](streamdeck/README.md) for the three setup options.

## Build from source

```bash
npm install
npm run rebuild      # compile better-sqlite3 against Electron's ABI
npm run dev          # run with hot reload
npm run package      # build the per-user NSIS installer into release/
```

Building the installer needs **Windows Developer Mode** on (so 7-Zip can unpack
electron-builder's winCodeSign), and a C++ toolchain (VS Build Tools, "Desktop
development with C++") for the native module.

## Tech stack

Electron · TypeScript · React · Zustand · better-sqlite3 (main process only,
reached over IPC) · electron-vite · electron-builder (NSIS).

The renderer is sandboxed (`contextIsolation`, no `nodeIntegration`); all
privileged work is in the main process behind a minimal preload IPC surface.

## Development

The app has no UI test framework; instead each subsystem has a guarded
self-test / E2E that runs in the real Electron runtime:

```bash
npm run typecheck
npm run db:selftest        # database layer
npm run state:selftest     # state-machine transitions
npm run triggers:selftest  # protocol parsing + hotkeys
npm run popup:e2e          # popup modes (drives the real DOM)
npm run log:selftest       # Today's Log editor + formatting
npm run log:e2e            # Today's Log window
npm run settings:e2e       # settings window
npm run config:selftest    # positioning + tooltip helpers
```

See [`CLAUDE.md`](CLAUDE.md) for architecture boundaries and conventions, and
[`docs/buildplan.md`](docs/buildplan.md) for the build history.

## Notes

- Pinned to **Electron 41**: better-sqlite3 doesn't yet support Electron 42's
  V8. Revisit when it does.
- v1 scope only — no Autotask API, cloud sync, or auto-updater.

## License

See [LICENSE](LICENSE).
