import { join } from 'node:path'
import { app } from 'electron'

// The brief pins storage to %APPDATA%\TimeTracker\ explicitly. We build that
// path directly rather than leaning on getPath('userData') casing, so the
// directory name stays exactly "TimeTracker" regardless of the package name.
export const dataDir = (): string => join(app.getPath('appData'), 'TimeTracker')
// TIMETRACKER_SETTINGS_PATH lets integration tests use a throwaway settings file
// instead of the user's real one (mirrors TIMETRACKER_DB_PATH for the database).
export const settingsPath = (): string =>
  process.env['TIMETRACKER_SETTINGS_PATH'] ?? join(dataDir(), 'settings.json')
export const dbPath = (): string => join(dataDir(), 'timer.db')
