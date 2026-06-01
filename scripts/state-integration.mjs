// Live integration test of crash recovery: seed a throwaway database with a
// stranded active block (no end_time), launch the REAL app pointed at it with
// recovery auto-answered 'end', and confirm the block is reconciled on launch
// (ended at the block start, since there's no heartbeat — no invented duration).
//
// better-sqlite3 is built for Electron's ABI, so seeding/reading the DB runs
// through `electron` in ELECTRON_RUN_AS_NODE mode (system Node can't load it).
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const electron = require('electron')
const tempDb = join(tmpdir(), `timetracker-int-${process.pid}.db`)
const START = 1_700_000_000_000

const runNode = (src) =>
  spawnSync(electron, ['-e', src], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf-8'
  }).stdout.trim()

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const cleanup = () => {
  for (const ext of ['', '-wal', '-shm']) rmSync(tempDb + ext, { force: true })
}

// Schema mirrors migration 1; user_version is set so the app skips migrating.
const seedSrc = `
const Database = require('better-sqlite3');
const db = new Database(${JSON.stringify(tempDb)});
db.exec("CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ticket_id TEXT, notes TEXT, created_at INTEGER NOT NULL); CREATE TABLE blocks (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, start_time INTEGER NOT NULL, end_time INTEGER, state TEXT NOT NULL, summary TEXT, FOREIGN KEY (task_id) REFERENCES tasks(id)); CREATE INDEX idx_blocks_state ON blocks(state); CREATE INDEX idx_blocks_start_time ON blocks(start_time); CREATE INDEX idx_blocks_task_id ON blocks(task_id);");
db.pragma('user_version = 1');
const t = db.prepare('INSERT INTO tasks (name, ticket_id, notes, created_at) VALUES (?,?,?,?)').run('CrashTest', null, null, ${START});
const b = db.prepare("INSERT INTO blocks (task_id, start_time, end_time, state, summary) VALUES (?,?,NULL,'active',NULL)").run(t.lastInsertRowid, ${START});
console.log(b.lastInsertRowid);
db.close();
`

const readSrc = (id) => `
const Database = require('better-sqlite3');
const db = new Database(${JSON.stringify(tempDb)}, { readonly: true });
console.log(JSON.stringify(db.prepare('SELECT state, end_time AS endTime FROM blocks WHERE id = ?').get(${id})));
db.close();
`

const fail = (msg, app) => {
  console.error(`FAIL: ${msg}`)
  if (app && !app.killed) app.kill()
  cleanup()
  process.exit(1)
}

async function main() {
  cleanup()
  const blockId = Number(runNode(seedSrc))
  if (!Number.isInteger(blockId) || blockId <= 0) fail('could not seed the database')
  console.log(`seeded stranded active block id=${blockId} (start=${START})`)

  const app = spawn(electron, ['.'], {
    stdio: 'ignore',
    env: { ...process.env, TIMETRACKER_DB_PATH: tempDb, TIMETRACKER_RECOVERY_AUTO: 'end' }
  })
  app.on('error', (e) => fail(`couldn't launch app: ${e.message}`, app))

  // Poll the committed DB state until recovery closes the block (or time out).
  let row = null
  for (let i = 0; i < 40; i += 1) {
    await delay(300)
    try {
      row = JSON.parse(runNode(readSrc(blockId)) || 'null')
    } catch {
      row = null
    }
    if (row && row.state === 'ended') break
  }

  app.kill()
  await delay(300)
  cleanup()

  if (!row || row.state !== 'ended') fail(`block was not reconciled (state=${row?.state ?? 'unknown'})`)
  if (row.endTime !== START) fail(`expected end_time=${START} (block start), got ${row.endTime}`)

  console.log(`reconciled: block ended at ${row.endTime} (= start, no invented duration)`)
  console.log('\nPASS: stranded active block reconciled on launch in the live app')
  process.exit(0)
}

main().catch((e) => fail(e.message))
