import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings'
import { dataDir, settingsPath } from './paths'

let cached: Settings | null = null

// Deep-merge persisted JSON over the defaults so a settings.json written by an
// older build (missing newer keys) still loads with sensible values. We only
// trust the known shape — unknown keys are dropped, not carried through.
const merge = (raw: unknown): Settings => {
  const r = (raw ?? {}) as Partial<Settings>
  const t = (r.triggers ?? {}) as Partial<Settings['triggers']>
  const h = (t.hotkeys ?? {}) as Partial<Settings['triggers']['hotkeys']>
  return {
    launchAtStartup: r.launchAtStartup ?? DEFAULT_SETTINGS.launchAtStartup,
    showStateToasts: r.showStateToasts ?? DEFAULT_SETTINGS.showStateToasts,
    triggers: {
      protocolEnabled: t.protocolEnabled ?? DEFAULT_SETTINGS.triggers.protocolEnabled,
      hotkeysEnabled: t.hotkeysEnabled ?? DEFAULT_SETTINGS.triggers.hotkeysEnabled,
      hotkeys: {
        newTask: h.newTask ?? DEFAULT_SETTINGS.triggers.hotkeys.newTask,
        endTask: h.endTask ?? DEFAULT_SETTINGS.triggers.hotkeys.endTask,
        pauseTask: h.pauseTask ?? DEFAULT_SETTINGS.triggers.hotkeys.pauseTask,
        resumeTask: h.resumeTask ?? DEFAULT_SETTINGS.triggers.hotkeys.resumeTask,
        status: h.status ?? DEFAULT_SETTINGS.triggers.hotkeys.status
      }
    },
    popupPosition: r.popupPosition ?? DEFAULT_SETTINGS.popupPosition,
    recentTasksWindowDays: r.recentTasksWindowDays ?? DEFAULT_SETTINGS.recentTasksWindowDays
  }
}

// Read settings from disk, writing a defaults file on first launch (or when the
// existing file is missing/corrupt). Caches the result for getSettings().
export const loadSettings = (): Settings => {
  try {
    cached = merge(JSON.parse(readFileSync(settingsPath(), 'utf-8')))
  } catch {
    cached = merge({})
    persist(cached)
  }
  return cached
}

export const getSettings = (): Settings => cached ?? loadSettings()

const persist = (value: Settings): void => {
  mkdirSync(dataDir(), { recursive: true })
  writeFileSync(settingsPath(), `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
}

// Persist a partial update over the current settings and return the new value.
export const updateSettings = (patch: Partial<Settings>): Settings => {
  const next = merge({ ...getSettings(), ...patch })
  persist(next)
  cached = next
  return next
}
