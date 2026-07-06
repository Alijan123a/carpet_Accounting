import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './db/schema'
import type { ChangeEntity, ChangeAction } from '../shared/contracts'

type DB = BetterSQLite3Database<typeof schema>

export interface ChangeInput {
  entity: ChangeEntity
  entityId: number | null
  action: ChangeAction
  /** Short human line identifying the record (name / label / amount). */
  summary: string
  before?: unknown
  after?: unknown
  /** Set when this change row records an UNDO of another change. */
  undoOfChangeId?: number
}

/**
 * Append one row to the system-changes audit log. Best-effort by design: a
 * failure to log must never abort the business operation itself.
 */
export function logChange(db: DB, c: ChangeInput): number {
  try {
    const res = db
      .insert(schema.systemChanges)
      .values({
        entity: c.entity,
        entityId: c.entityId,
        action: c.action,
        summary: c.summary,
        beforeJson: c.before != null ? JSON.stringify(c.before) : null,
        afterJson: c.after != null ? JSON.stringify(c.after) : null,
        createdAt: Date.now(),
        undoOfChangeId: c.undoOfChangeId ?? null
      })
      .run()
    return Number(res.lastInsertRowid)
  } catch (e) {
    console.error('changeLog failed:', e)
    return 0
  }
}
