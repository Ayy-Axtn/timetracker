import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { dbPath } from '../paths'
import { runMigrations } from './migrations'

// better-sqlite3 is a native module and lives ONLY here in the main process. It
// is never imported by the preload or renderer — they reach it over IPC. The
// connection is a process-wide singleton opened once on launch.
let db: Database.Database | null = null

/**
 * Open the database (creating the file and folder on first launch), apply
 * pragmas and migrations, and cache the connection. Pass ':memory:' for an
 * isolated in-memory database (used by the self-test).
 */
export const initDatabase = (path?: string): Database.Database => {
  if (db) return db
  // Explicit arg wins (self-tests pass ':memory:'); TIMETRACKER_DB_PATH allows
  // pointing at a throwaway database for integration tests; otherwise the real
  // %APPDATA%\TimeTracker\timer.db.
  const target = path ?? process.env['TIMETRACKER_DB_PATH'] ?? dbPath()
  if (target !== ':memory:') mkdirSync(dirname(target), { recursive: true })

  db = new Database(target)
  db.pragma('journal_mode = WAL') // durable + concurrent reads
  db.pragma('foreign_keys = ON') // enforce the blocks→tasks reference
  db.pragma('synchronous = NORMAL') // safe pairing with WAL
  runMigrations(db)
  return db
}

export const getDb = (): Database.Database => {
  if (!db) throw new Error('Database not initialised — call initDatabase() first')
  return db
}

export const closeDatabase = (): void => {
  db?.close()
  db = null
}
