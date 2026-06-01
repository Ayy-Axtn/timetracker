import { join } from 'node:path'
import { app } from 'electron'

// The brief pins storage to %APPDATA%\TimeTracker\ explicitly. We build that
// path directly rather than leaning on getPath('userData') casing, so the
// directory name stays exactly "TimeTracker" regardless of the package name.
export const dataDir = (): string => join(app.getPath('appData'), 'TimeTracker')
export const settingsPath = (): string => join(dataDir(), 'settings.json')
export const dbPath = (): string => join(dataDir(), 'timer.db')
