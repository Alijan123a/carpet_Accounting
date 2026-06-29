import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

let sqlite: Database.Database | null = null
let db: BetterSQLite3Database<typeof schema> | null = null

/**
 * Open the SQLite database and configure it for performance.
 * Per CLAUDE.md performance rules, WAL mode is enabled from day one.
 * Called once on app startup.
 */
export function initDatabase(): BetterSQLite3Database<typeof schema> {
  if (db) return db

  const dbPath = join(app.getPath('userData'), 'qaleen-trader.db')
  sqlite = new Database(dbPath)

  // Performance / durability pragmas (NON-NEGOTIABLE: WAL mode).
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')

  db = drizzle(sqlite, { schema })
  return db
}

/** Get the live Drizzle database instance (must call initDatabase first). */
export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

/** Close the database cleanly on quit. */
export function closeDatabase(): void {
  if (sqlite) {
    sqlite.close()
    sqlite = null
    db = null
  }
}
