import { useEffect, useState } from 'react'
import type { HotkeyMap, PopupPosition, Settings } from '../../../shared/settings'

const HOTKEY_ROWS: { label: string; key: keyof HotkeyMap }[] = [
  { label: 'New task', key: 'newTask' },
  { label: 'End task', key: 'endTask' },
  { label: 'Pause task', key: 'pauseTask' },
  { label: 'Resume task', key: 'resumeTask' }
]

export function SettingsApp(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [hotkeyDraft, setHotkeyDraft] = useState<HotkeyMap | null>(null)
  const [hotkeyMessage, setHotkeyMessage] = useState('')

  const adopt = (s: Settings): void => {
    setSettings(s)
    setHotkeyDraft(s.triggers.hotkeys)
  }

  useEffect(() => {
    window.api.getSettings().then(adopt)
  }, [])

  // Persist a patch; the main side applies any OS-level side effects.
  const patch = async (p: Partial<Settings>): Promise<void> => {
    adopt(await window.api.updateSettings(p))
  }

  const setTrigger = (key: 'protocolEnabled' | 'hotkeysEnabled', value: boolean): Promise<void> =>
    patch({ triggers: { ...settings!.triggers, [key]: value } })

  const saveHotkeys = async (): Promise<void> => {
    if (!hotkeyDraft) return
    const result = await window.api.setHotkeys(hotkeyDraft)
    if (result.ok) {
      setHotkeyMessage('Saved.')
      adopt(await window.api.getSettings())
    } else {
      const failed = result.results.filter((r) => !r.ok).map((r) => r.key).join(', ')
      setHotkeyMessage(`Couldn't register: ${failed}. Reverted.`)
      adopt(await window.api.getSettings())
    }
  }

  if (!settings || !hotkeyDraft) return <main className="settings">Loading…</main>

  return (
    <main className="settings">
      <h1>Settings</h1>

      <section>
        <h2>General</h2>
        <label className="row">
          <input
            type="checkbox"
            data-testid="settings-launch"
            checked={settings.launchAtStartup}
            onChange={(e) => patch({ launchAtStartup: e.target.checked })}
          />
          Launch at Windows startup
        </label>
        <label className="row">
          <input
            type="checkbox"
            data-testid="settings-toasts"
            checked={settings.showStateToasts}
            onChange={(e) => patch({ showStateToasts: e.target.checked })}
          />
          Show state-change notifications
        </label>
      </section>

      <section>
        <h2>Triggers</h2>
        <label className="row">
          <input
            type="checkbox"
            data-testid="settings-protocol"
            checked={settings.triggers.protocolEnabled}
            onChange={(e) => setTrigger('protocolEnabled', e.target.checked)}
          />
          Enable <code>timetracker://</code> protocol (Stream Deck)
        </label>
        <label className="row">
          <input
            type="checkbox"
            data-testid="settings-hotkeys-enabled"
            checked={settings.triggers.hotkeysEnabled}
            onChange={(e) => setTrigger('hotkeysEnabled', e.target.checked)}
          />
          Enable global hotkeys (fallback)
        </label>

        <div className="hotkeys">
          {HOTKEY_ROWS.map(({ label, key }) => (
            <label className="hotkey-row" key={key}>
              <span>{label}</span>
              <input
                className="field"
                data-testid={`settings-hotkey-${key}`}
                value={hotkeyDraft[key]}
                disabled={!settings.triggers.hotkeysEnabled}
                onChange={(e) => setHotkeyDraft({ ...hotkeyDraft, [key]: e.target.value })}
              />
            </label>
          ))}
          <div className="hotkey-actions">
            <button
              className="btn primary"
              data-testid="settings-hotkeys-save"
              disabled={!settings.triggers.hotkeysEnabled}
              onClick={saveHotkeys}
            >
              Save hotkeys
            </button>
            <span className="hotkey-message" data-testid="settings-hotkey-message">
              {hotkeyMessage}
            </span>
          </div>
        </div>
      </section>

      <section>
        <h2>Popups</h2>
        <label className="row">
          Position
          <select
            className="field"
            data-testid="settings-position"
            value={settings.popupPosition}
            onChange={(e) => patch({ popupPosition: e.target.value as PopupPosition })}
          >
            <option value="cursor">Near the cursor (clamped)</option>
            <option value="activeMonitorCentre">Centre of the active monitor</option>
          </select>
        </label>
        <label className="row">
          Recent tasks window (days)
          <input
            type="number"
            min={1}
            className="field narrow"
            data-testid="settings-recent-days"
            value={settings.recentTasksWindowDays}
            onChange={(e) => patch({ recentTasksWindowDays: Number(e.target.value) || 1 })}
          />
        </label>
      </section>
    </main>
  )
}
