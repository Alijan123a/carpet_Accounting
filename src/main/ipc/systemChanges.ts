import { ipcMain } from 'electron'
import { and, eq, like, isNull, desc, asc, sql, type SQL } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { logChange } from '../changeLog'
import { reverseTransaction, postTransaction } from '../accounting/ledger'
import type {
  SystemChangesListParams,
  SystemChangesListResult,
  SystemChangeView,
  UndoFailReason,
  ChangeEntity
} from '../../shared/contracts'

type DB = BetterSQLite3Database<typeof schema>
type Row = schema.SystemChangeRow

/** Drizzle table for each snapshot-restorable entity. */
const TABLES = {
  client: schema.clients,
  carpet: schema.carpets,
  material: schema.materials,
  material_line: schema.materialLines,
  expense: schema.expenses,
  order: schema.orders,
  carpet_status: schema.carpetStatuses,
  invoice: schema.invoices
} as const

function toView(r: Row): SystemChangeView {
  return {
    id: r.id,
    entity: r.entity as SystemChangeView['entity'],
    entityId: r.entityId,
    action: r.action as SystemChangeView['action'],
    summary: r.summary,
    createdAt: r.createdAt,
    undoneAt: r.undoneAt,
    undoOfChangeId: r.undoOfChangeId
  }
}

export function listChanges(db: DB, params: SystemChangesListParams): SystemChangesListResult {
  const conds: (SQL | undefined)[] = []
  if (params.entity && params.entity !== 'all') conds.push(eq(schema.systemChanges.entity, params.entity))
  const search = params.search?.trim()
  if (search) conds.push(like(schema.systemChanges.summary, `%${search}%`))
  const where = conds.length ? and(...conds) : undefined

  const dirFn = params.sortDir === 'asc' ? asc : desc
  const rows = db
    .select()
    .from(schema.systemChanges)
    .where(where)
    .orderBy(dirFn(schema.systemChanges.id))
    .limit(params.limit)
    .offset(params.offset)
    .all()
  const totalRow = db.select({ c: sql<number>`COUNT(*)` }).from(schema.systemChanges).where(where).get()
  return { rows: rows.map(toView), total: Number(totalRow?.c ?? 0) }
}

const parse = <T>(json: string | null): T | null => (json ? (JSON.parse(json) as T) : null)

/** True when a reversal row already exists for the given transaction. */
function isReversed(db: DB, txId: number): boolean {
  const row = db
    .select({ c: sql<number>`COUNT(*)` })
    .from(schema.transactions)
    .where(eq(schema.transactions.reversesTransactionId, txId))
    .get()
  return Number(row?.c ?? 0) > 0
}

/** Reverse a transaction only if it has not been reversed yet. */
function reverseOnce(db: DB, txId: number): void {
  if (!isReversed(db, txId)) reverseTransaction(db, txId)
}

/**
 * Undo one audit-log change. The ledger is NEVER edited: money movements are
 * undone by posting reversals; row snapshots are restored for profile data.
 * Only the latest non-undone change of a record may be undone, so undo always
 * walks history backwards without conflicts.
 */
export function undoChange(db: DB, changeId: number): { ok: boolean; reason?: UndoFailReason } {
  const change = db.select().from(schema.systemChanges).where(eq(schema.systemChanges.id, changeId)).get()
  if (!change) return { ok: false, reason: 'not_found' }
  if (change.undoneAt != null) return { ok: false, reason: 'already_undone' }
  if (change.undoOfChangeId != null || change.action === 'undo') return { ok: false, reason: 'is_undo' }

  // Guard: the change must be the record's most recent live change.
  if (change.entityId != null) {
    const latest = db
      .select({ id: schema.systemChanges.id })
      .from(schema.systemChanges)
      .where(
        and(
          eq(schema.systemChanges.entity, change.entity),
          eq(schema.systemChanges.entityId, change.entityId),
          isNull(schema.systemChanges.undoneAt),
          isNull(schema.systemChanges.undoOfChangeId)
        )
      )
      .orderBy(desc(schema.systemChanges.id))
      .limit(1)
      .get()
    if (latest && latest.id !== change.id) return { ok: false, reason: 'not_latest' }
  }

  const result = db.transaction((tx) => applyUndo(tx as unknown as DB, change))
  if (!result.ok) return result

  const undoId = logChange(db, {
    entity: change.entity as ChangeEntity,
    entityId: change.entityId,
    action: 'undo',
    summary: change.summary,
    undoOfChangeId: change.id
  })
  db.update(schema.systemChanges)
    .set({ undoneAt: Date.now(), undoneByChangeId: undoId })
    .where(eq(schema.systemChanges.id, change.id))
    .run()
  return { ok: true }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function applyUndo(db: DB, change: Row): { ok: boolean; reason?: UndoFailReason } {
  const entity = change.entity as ChangeEntity
  const action = change.action
  const id = change.entityId

  // --- Ledger-linked undos (always via reversals) ---------------------------
  if (entity === 'transaction') {
    if (id == null) return { ok: false, reason: 'not_undoable' }
    if (action === 'payment') {
      if (isReversed(db, id)) return { ok: false, reason: 'already_undone' }
      reverseTransaction(db, id)
      return { ok: true }
    }
    if (action === 'reverse') {
      // Undo a reversal by posting a counter-reversal of the reversal row.
      const reversalRow = parse<schema.TransactionRow>(change.afterJson)
      if (!reversalRow) return { ok: false, reason: 'not_undoable' }
      if (isReversed(db, reversalRow.id)) return { ok: false, reason: 'already_undone' }
      postTransaction(db, {
        clientId: reversalRow.clientId,
        type: 'reversal',
        currency: reversalRow.currency,
        amountCents: -reversalRow.amountCents,
        carpetId: reversalRow.carpetId,
        materialLineId: reversalRow.materialLineId,
        transactionDate: Date.now(),
        reversesTransactionId: reversalRow.id,
        note: reversalRow.note ? `واپسی ${reversalRow.note}` : `واپسی تراکنش #${reversalRow.id}`
      })
      return { ok: true }
    }
    return { ok: false, reason: 'not_undoable' }
  }

  if (entity === 'carpet' && action === 'sell') {
    if (id == null) return { ok: false, reason: 'not_undoable' }
    const carpet = db.select().from(schema.carpets).where(eq(schema.carpets.id, id)).get()
    const before = parse<schema.CarpetRow>(change.beforeJson)
    if (!carpet || !before || carpet.sellTransactionId == null) return { ok: false, reason: 'not_undoable' }
    reverseOnce(db, carpet.sellTransactionId)
    db.update(schema.carpets)
      .set({
        status: before.status,
        sellPricePerMeterCents: null,
        sellSortDeductionCents: null,
        sellTotalPriceCents: null,
        soldToClientId: null,
        sellTransactionId: null,
        soldAt: null
      })
      .where(eq(schema.carpets.id, id))
      .run()
    return { ok: true }
  }

  if (entity === 'material_line') {
    if (id == null) return { ok: false, reason: 'not_undoable' }
    const line = db.select().from(schema.materialLines).where(eq(schema.materialLines.id, id)).get()
    if (!line) return { ok: false, reason: 'not_found' }
    if (action === 'create') {
      // Same effect as deleting the line: reverse its transaction + hide it.
      if (line.deleted) return { ok: false, reason: 'already_undone' }
      if (line.transactionId != null) reverseOnce(db, line.transactionId)
      db.update(schema.materialLines)
        .set({ deleted: true, deletedAt: Date.now() })
        .where(eq(schema.materialLines.id, id))
        .run()
      return { ok: true }
    }
    if (action === 'delete') {
      // Restore the line: counter-reverse its reversal + unhide.
      if (!line.deleted) return { ok: false, reason: 'already_undone' }
      if (line.transactionId != null) {
        const reversal = db
          .select()
          .from(schema.transactions)
          .where(eq(schema.transactions.reversesTransactionId, line.transactionId))
          .get()
        if (reversal && !isReversed(db, reversal.id)) {
          postTransaction(db, {
            clientId: reversal.clientId,
            type: 'reversal',
            currency: reversal.currency,
            amountCents: -reversal.amountCents,
            carpetId: reversal.carpetId,
            materialLineId: reversal.materialLineId,
            transactionDate: Date.now(),
            reversesTransactionId: reversal.id,
            note: reversal.note ? `واپسی ${reversal.note}` : `واپسی تراکنش #${reversal.id}`
          })
        }
      }
      db.update(schema.materialLines)
        .set({ deleted: false, deletedAt: null })
        .where(eq(schema.materialLines.id, id))
        .run()
      return { ok: true }
    }
    return { ok: false, reason: 'not_undoable' }
  }

  // --- Snapshot-based undos --------------------------------------------------
  const table = TABLES[entity as keyof typeof TABLES] as any
  if (!table || id == null) return { ok: false, reason: 'not_undoable' }

  if (action === 'create') {
    // Deleting the created record — only when nothing references it.
    if (entity === 'carpet') {
      const txCount = db
        .select({ c: sql<number>`COUNT(*)` })
        .from(schema.transactions)
        .where(eq(schema.transactions.carpetId, id))
        .get()
      if (Number(txCount?.c ?? 0) > 0) {
        // Ledger-linked carpet: reverse its live transactions, then hide it.
        const txs = db.select().from(schema.transactions).where(eq(schema.transactions.carpetId, id)).all()
        for (const t of txs) {
          if (t.type !== 'reversal') reverseOnce(db, t.id)
        }
        db.update(schema.carpets)
          .set({ archived: true, archivedAt: Date.now() })
          .where(eq(schema.carpets.id, id))
          .run()
        return { ok: true }
      }
    }
    if (entity === 'client') {
      const refs = db
        .select({ c: sql<number>`COUNT(*)` })
        .from(schema.transactions)
        .where(eq(schema.transactions.clientId, id))
        .get()
      if (Number(refs?.c ?? 0) > 0) return { ok: false, reason: 'has_records' }
    }
    if (entity === 'material') {
      const lines = db
        .select({ c: sql<number>`COUNT(*)` })
        .from(schema.materialLines)
        .where(eq(schema.materialLines.materialId, id))
        .get()
      if (Number(lines?.c ?? 0) > 0) return { ok: false, reason: 'has_records' }
    }
    if (entity === 'carpet_status') {
      const status = db.select().from(schema.carpetStatuses).where(eq(schema.carpetStatuses.id, id)).get()
      if (status) {
        const inUse = db
          .select({ c: sql<number>`COUNT(*)` })
          .from(schema.carpets)
          .where(eq(schema.carpets.status, status.key))
          .get()
        if (Number(inUse?.c ?? 0) > 0) return { ok: false, reason: 'in_use' }
      }
    }
    try {
      db.delete(table).where(eq(table.id, id)).run()
    } catch {
      return { ok: false, reason: 'has_records' }
    }
    return { ok: true }
  }

  if (action === 'update' || action === 'archive' || action === 'restore') {
    const before = parse<Record<string, unknown>>(change.beforeJson)
    if (!before) return { ok: false, reason: 'not_undoable' }
    const { id: _ignored, ...fields } = before
    db.update(table).set(fields).where(eq(table.id, id)).run()
    return { ok: true }
  }

  if (action === 'delete') {
    const before = parse<Record<string, unknown>>(change.beforeJson)
    if (!before) return { ok: false, reason: 'not_undoable' }
    db.insert(table).values(before).run()
    return { ok: true }
  }

  return { ok: false, reason: 'not_undoable' }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function registerSystemChangesIpc(getDb: () => DB): void {
  ipcMain.handle('system:list', (_e, params: SystemChangesListParams) => listChanges(getDb(), params))
  ipcMain.handle('system:undo', (_e, changeId: number) => undoChange(getDb(), changeId))
}
