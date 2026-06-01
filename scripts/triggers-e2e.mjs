// End-to-end test of the PRIMARY trigger path: a running app, then protocol
// URLs fired as fresh launches that fail the single-instance lock and forward
// their argv to the primary's second-instance handler, which parses and
// dispatches them. The primary records each dispatch to a sink file (E2E mode);
// we assert all four actions arrive as 'protocol' dispatches.
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const electron = require('electron')
const sink = join(tmpdir(), `timetracker-e2e-${process.pid}.log`)
const env = { ...process.env, TIMETRACKER_TRIGGER_E2E: sink }
const ACTIONS = ['newtask', 'endtask', 'pausetask', 'resumetask']

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const readLines = () => {
  try {
    return readFileSync(sink, 'utf-8').trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  cleanup()
  process.exit(1)
}

let primary
const cleanup = () => {
  if (primary && !primary.killed) primary.kill()
  rmSync(sink, { force: true })
}

async function main() {
  rmSync(sink, { force: true })

  // 1) Start the primary instance; it acquires the lock and stays alive.
  primary = spawn(electron, ['.'], { stdio: 'ignore', env })
  primary.on('error', (e) => fail(`couldn't launch primary: ${e.message}`))

  // 2) Wait until the primary signals readiness (lock held, dispatch live).
  for (let i = 0; i < 60 && !readLines().includes('ready:primary'); i += 1) await delay(250)
  if (!readLines().includes('ready:primary')) fail('primary never became ready (lock not acquired)')

  // 3) Fire each protocol URL as a second instance. Each should fail the lock,
  //    forward its argv, and exit — the primary handles the dispatch.
  for (const action of ACTIONS) {
    spawnSync(electron, ['.', `timetracker://${action}`], { stdio: 'ignore', env })
    await delay(500)
  }
  await delay(800)

  // 4) Assert every action was dispatched via the protocol/second-instance path.
  const dispatched = readLines().filter((l) => l !== 'ready:primary')
  console.log('dispatched:', dispatched.join(' | ') || '(none)')
  const expected = ACTIONS.map((a) => `${a}:protocol`)
  const missing = expected.filter((e) => !dispatched.includes(e))

  cleanup()
  await delay(200)

  if (missing.length > 0) fail(`missing dispatches: ${missing.join(', ')}`)
  console.log(`\nPASS: all ${ACTIONS.length} protocol actions dispatched through the single-instance handler`)
  process.exit(0)
}

main().catch((e) => fail(e.message))
