// Launches the built app in config-self-test mode, which runs the pure polish
// helpers (popup positioning maths, tray tooltip text) and writes the result.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const electron = require('electron')
const outFile = join(tmpdir(), `timetracker-config-${process.pid}.json`)

const child = spawn(electron, ['.'], {
  stdio: 'ignore',
  env: { ...process.env, TIMETRACKER_CONFIG_SELFTEST: '1', TIMETRACKER_CONFIG_SELFTEST_OUT: outFile }
})

child.on('error', (err) => {
  console.error(`Failed to launch Electron: ${err.message}`)
  process.exit(1)
})

child.on('exit', (code) => {
  let result
  try {
    result = JSON.parse(readFileSync(outFile, 'utf-8'))
    rmSync(outFile, { force: true })
  } catch {
    console.error(`No self-test result file (electron exit code ${code}).`)
    process.exit(1)
  }

  for (const c of result.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}`)
  if (result.error) console.error(`\nERROR:\n${result.error}`)
  const passed = result.checks.filter((c) => c.ok).length
  console.log(`\n${passed}/${result.checks.length} checks passed`)
  process.exit(result.ok ? 0 : 1)
})
