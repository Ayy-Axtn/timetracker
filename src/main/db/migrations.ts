import type { Database } from 'better-sqlite3'

// Versioned, forward-only schema migrations gated on PRAGMA user_version.
// Each migration bumps the version by one; runMigrations applies any whose
// version exceeds the database's current one, inside a single transaction.
interface Migration {
  version: number
  up: (db: Database) => void
}

const migrations: Migration[] = [
  {
    version: 1,
    up: (db) => {
      // Schema mirrors the brief exactly. Timestamps are Unix milliseconds.
      db.exec(`
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          ticket_id TEXT,
          notes TEXT,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE blocks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          state TEXT NOT NULL,
          summary TEXT,
          FOREIGN KEY (task_id) REFERENCES tasks(id)
        );

        CREATE INDEX idx_blocks_state ON blocks(state);
        CREATE INDEX idx_blocks_start_time ON blocks(start_time);
        CREATE INDEX idx_blocks_task_id ON blocks(task_id);
      `)
    }
  }
]

export const runMigrations = (db: Database): void => {
  const current = db.pragma('user_version', { simple: true }) as number
  const pending = migrations
    .filter((m) => m.version > current)
    .sort((a, b) => a.version - b.version)
  if (pending.length === 0) return

  const apply = db.transaction(() => {
    for (const migration of pending) {
      migration.up(db)
      // Version is a trusted integer from our own list, not user input.
      db.pragma(`user_version = ${migration.version}`)
    }
  })
  apply()
}
