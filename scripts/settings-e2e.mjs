// Launches the built app in settings-E2E mode against a throwaway settings file
// and drives the real settings window to verify each control persists and the
// hotkey validate-before-persist behaviour. Results are written to a file.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const electron = require('electron')
const outFile = join(tmpdir(), `timetracker-settings-${process.pid}.json`)
const settingsFile = join(tmpdir(), `timetracker-settings-${process.pid}.json.cfg`)
const cleanup = () => rmSync(settingsFile, { force: true })

cleanup()
const child = spawn(electron, ['.'], {
  stdio: 'ignore',
  env: {
    ...process.env,
    TIMETRACKER_SETTINGS_E2E: '1',
    TIMETRACKER_SETTINGS_E2E_OUT: outFile,
    TIMETRACKER_SETTINGS_PATH: settingsFile
  }
})

child.on('error', (err) => {
  console.error(`Failed to launch Electron: ${err.message}`)
  cleanup()
  process.exit(1)
})

child.on('exit', (code) => {
  let result
  try {
    result = JSON.parse(readFileSync(outFile, 'utf-8'))
    rmSync(outFile, { force: true })
  } catch {
    console.error(`No settings-E2E result file (electron exit code ${code}).`)
    cleanup()
    process.exit(1)
  }
  cleanup()

  for (const c of result.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}`)
  if (result.error) console.error(`\nERROR:\n${result.error}`)
  const passed = result.checks.filter((c) => c.ok).length
  console.log(`\n${passed}/${result.checks.length} checks passed`)
  process.exit(result.ok ? 0 : 1)
})
