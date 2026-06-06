# Changelog

## v1.1.0 — 2026-06-06

A polish release after a week of daily use.

### Added
- **Edit time entries** — Start and End times are now click-to-edit in Today's
  Log, alongside the existing task / reference / notes / summary editing. Edits
  are validated so a block always ends after it starts.
- **Settings button** in the Today's Log header — open Settings without going
  through the tray menu.

### Changed
- **"Ticket" is now "Reference"** throughout the UI, the CSV export, and the New
  Task / back-date popups. Internal storage is unchanged, so existing data
  carries over with no migration.
- **New Task: Enter starts the task from the notes field too** — previously
  Enter only worked from the name and reference fields. Shift+Enter inserts a
  newline.
- **Multi-line notes & summaries** keep their line breaks in Today's Log and now
  edit in a textarea (Enter commits, Shift+Enter for a new line).
- **Smarter popups** — the description field grows as you type, and the popup
  window sizes itself to its content (no dead space below) and grows with it.

### Fixed
- The popup window no longer collapses to a sliver on high-DPI (scaled) displays
  while resizing.

### Notes
- The installer is unsigned; Windows SmartScreen may warn on first run — choose
  *More info → Run anyway*.

## v1.0.0

Initial release: tray-based personal time tracker triggered by a Stream Deck via
the `timetracker://` protocol, with keyboard-first popups, a crash-safe
heartbeat, an editable Today's Log, CSV export, and a per-user NSIS installer.
