// Shape of settings.json, persisted in %APPDATA%\TimeTracker\settings.json.
// Defaults below mirror the brief; main/settings.ts handles load/save and
// merges persisted values over these so older files gain new keys safely.

export interface HotkeyMap {
  newTask: string
  endTask: string
  pauseTask: string
  resumeTask: string
  status: string
}

export interface TriggerSettings {
  protocolEnabled: boolean
  hotkeysEnabled: boolean
  hotkeys: HotkeyMap
}

export type PopupPosition = 'cursor' | 'activeMonitorCentre'

export interface Settings {
  launchAtStartup: boolean
  showStateToasts: boolean
  triggers: TriggerSettings
  popupPosition: PopupPosition
  recentTasksWindowDays: number
}

export const DEFAULT_SETTINGS: Settings = {
  launchAtStartup: true,
  showStateToasts: true,
  triggers: {
    protocolEnabled: true,
    hotkeysEnabled: true,
    hotkeys: {
      newTask: 'F13',
      endTask: 'F14',
      pauseTask: 'F15',
      resumeTask: 'F16',
      status: 'F17'
    }
  },
  popupPosition: 'cursor',
  recentTasksWindowDays: 14
}
