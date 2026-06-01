// One-shot smoke test: launch the built Electron app, watch for early crashes,
// then terminate. Exits non-zero if the main process dies on its own (a runtime
// error the build/typecheck can't catch). Not part of the app — a dev aid.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electron = require('electron') // path to the electron binary
const RUN_MS = 6000

let output = ''
let exitedEarly = false

const child = spawn(electron, ['.'], { stdio: ['ignore', 'pipe', 'pipe'] })
child.stdout.on('data', (d) => (output += d))
child.stderr.on('data', (d) => (output += d))
child.on('exit', (code, signal) => {
  if (!shuttingDown) {
    exitedEarly = true
    console.log(`Main process exited early: code=${code} signal=${signal}`)
  }
})

let shuttingDown = false
const timer = setTimeout(() => {
  shuttingDown = true
  child.kill()
  console.log('--- captured output ---')
  console.log(output.trim() || '(none)')
  console.log('--- result ---')
  console.log(exitedEarly ? 'FAIL: app crashed before timeout' : 'OK: app stayed alive for 6s')
  process.exit(exitedEarly ? 1 : 0)
}, RUN_MS)

child.on('error', (err) => {
  clearTimeout(timer)
  console.log(`Failed to launch Electron: ${err.message}`)
  process.exit(1)
})
