import { ipcMain } from 'electron'
import { and, or, eq, like, inArray, asc, desc, sql, type SQL, type AnyColumn } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { reverseTransaction } from '../accounting/ledger'
import {
  materialLineTotalCents,
  weightedAverageBuyPricePerKgCents,
  aggregateMaterialProfitCents,
  materialLineProfitCents,
  postingAmountCents,
  type MaterialLineLike
} from '../../shared/accounting'
import type {
  MaterialInput,
  MaterialLineInput,
  MaterialListItem,
  MaterialDetailView,
  MaterialLineView,
  MaterialsListParams,
  MaterialsListResult
} from '../../shared/contracts'

type DB = BetterSQLite3Database<typeof schema>

const toLike = (l: schema.MaterialLineRow): MaterialLineLike => ({
  direction: l.direction,
  currency: l.currency,
  kilograms: l.kilograms,
  pricePerKgCents: l.pricePerKgCents
})

function summarize(lines: schema.MaterialLineRow[]): {
  boughtKg: number
  soldKg: number
  stockKg: number
  avgBuyPerKgCents: number
  profitCents: number
} {
  const buys = lines.filter((l) => l.direction === 'buy')
  const sells = lines.filter((l) => l.direction === 'sell')
  const boughtKg = buys.reduce((s, l) => s + l.kilograms, 0)
  const soldKg = sells.reduce((s, l) => s + l.kilograms, 0)
  return {
    boughtKg,
    soldKg,
    stockKg: boughtKg - soldKg,
    avgBuyPerKgCents: weightedAverageBuyPricePerKgCents(buys.map(toLike)),
    profitCents: aggregateMaterialProfitCents(buys.map(toLike), sells.map(toLike))
  }
}

/** Net stock (bought − sold kg) as a correlated subquery, for ORDER BY. */
const stockSort: SQL = sql`(SELECT COALESCE(SUM(CASE WHEN ml.direction = 'buy' THEN ml.kilograms ELSE -ml.kilograms END), 0) FROM material_lines ml WHERE ml.material_id = ${schema.materials.id} AND ml.deleted = 0)`

/** Whitelisted sort columns for the materials list. */
const MATERIAL_SORTS: Record<string, SQL | AnyColumn> = {
  name: schema.materials.name,
  currency: schema.materials.currency,
  createdAt: schema.materials.createdAt,
  stockKg: stockSort
}

export function listMaterials(db: DB, params: MaterialsListParams): MaterialsListResult {
  const conds: (SQL | undefined)[] = []
  if (!params.includeArchived) conds.push(eq(schema.materials.archived, false))
  const search = params.search?.trim()
  if (search) conds.push(or(like(schema.materials.name, `%${search}%`)))
  const where = conds.length ? and(...conds) : undefined

  const sortCol = MATERIAL_SORTS[params.sortBy ?? ''] ?? schema.materials.name
  const dirFn = params.sortDir === 'desc' ? desc : asc

  const rows = db
    .select()
    .from(schema.materials)
    .where(where)
    .orderBy(dirFn(sortCol), asc(schema.materials.id))
    .limit(params.limit)
    .offset(params.offset)
    .all()
  const totalRow = db.select({ c: sql<number>`COUNT(*)` }).from(schema.materials).where(where).get()

  const ids = rows.map((r) => r.id)
  const lines = ids.length
    ? db
        .select()
        .from(schema.materialLines)
        .where(and(inArray(schema.materialLines.materialId, ids), eq(schema.materialLines.deleted, false)))
        .all()
    : []
  const byMaterial = new Map<number, schema.MaterialLineRow[]>()
  for (const l of lines) {
    const arr = byMaterial.get(l.materialId) ?? []
    arr.push(l)
    byMaterial.set(l.materialId, arr)
  }

  const items: MaterialListItem[] = rows.map((m) => {
    const s = summarize(byMaterial.get(m.id) ?? [])
    return {
      id: m.id,
      name: m.name,
      currency: m.currency,
      archived: m.archived,
      boughtKg: s.boughtKg,
      soldKg: s.soldKg,
      stockKg: s.stockKg,
      profitCents: s.profitCents
    }
  })
  return { rows: items, total: Number(totalRow?.c ?? 0) }
}

export function getMaterial(db: DB, id: number): MaterialDetailView | null {
  const m = db.select().from(schema.materials).where(eq(schema.materials.id, id)).get()
  if (!m) return null
  // Deleted lines are excluded everywhere: their ledger movement was reversed.
  const activeLines = and(eq(schema.materialLines.materialId, id), eq(schema.materialLines.deleted, false))
  const lineRows = db.select().from(schema.materialLines).where(activeLines).all()
  const s = summarize(lineRows)

  const client = alias(schema.clients, 'ml_client')
  const joined = db
    .select({ line: schema.materialLines, clientName: client.name })
    .from(schema.materialLines)
    .leftJoin(client, eq(schema.materialLines.clientId, client.id))
    .where(activeLines)
    .orderBy(asc(schema.materialLines.transactionDate), asc(schema.materialLines.id))
    .all()

  const lines: MaterialLineView[] = joined.map(({ line, clientName }) => ({
    id: line.id,
    direction: line.direction,
    clientId: line.clientId,
    clientName,
    kilograms: line.kilograms,
    pricePerKgCents: line.pricePerKgCents,
    totalCents: line.totalCents,
    currency: line.currency,
    transactionDate: line.transactionDate,
    transactionId: line.transactionId,
    lineProfitCents:
      line.direction === 'sell' ? materialLineProfitCents(toLike(line), s.avgBuyPerKgCents) : null
  }))

  return {
    id: m.id,
    name: m.name,
    currency: m.currency,
    archived: m.archived,
    boughtKg: s.boughtKg,
    soldKg: s.soldKg,
    stockKg: s.stockKg,
    avgBuyPerKgCents: s.avgBuyPerKgCents,
    profitCents: s.profitCents,
    lines
  }
}

export function createMaterial(db: DB, input: MaterialInput): number {
  const res = db
    .insert(schema.materials)
    .values({ name: input.name.trim(), currency: input.currency, createdAt: Date.now() })
    .run()
  return Number(res.lastInsertRowid)
}

/**
 * Add a buy/sell line under a material lot. The matching IMMUTABLE transaction
 * (purchase for buy, sale for sell) is posted in the client's account in the
 * same db transaction, in the lot's currency.
 */
export function addMaterialLine(db: DB, input: MaterialLineInput): number {
  const material = db.select().from(schema.materials).where(eq(schema.materials.id, input.materialId)).get()
  if (!material) throw new Error('Material lot not found')
  const totalCents = materialLineTotalCents(input.pricePerKgCents, input.kilograms)
  const now = Date.now()
  return db.transaction((tx) => {
    const lineId = Number(
      tx
        .insert(schema.materialLines)
        .values({
          materialId: input.materialId,
          direction: input.direction,
          clientId: input.clientId,
          kilograms: input.kilograms,
          pricePerKgCents: input.pricePerKgCents,
          totalCents,
          currency: material.currency,
          transactionDate: input.transactionDate ?? now,
          createdAt: now
        })
        .run().lastInsertRowid
    )
    const amountCents =
      input.direction === 'buy'
        ? postingAmountCents({ kind: 'purchase', amountCents: totalCents })
        : postingAmountCents({ kind: 'sale', amountCents: totalCents })
    const txId = Number(
      tx
        .insert(schema.transactions)
        .values({
          clientId: input.clientId,
          type: input.direction === 'buy' ? 'purchase' : 'sale',
          currency: material.currency,
          amountCents,
          materialLineId: lineId,
          transactionDate: input.transactionDate ?? now,
          createdAt: now,
          // Auto-note in Dari (single Afghan trader; see CLAUDE.md §6).
          note: `${input.direction === 'buy' ? 'خرید' : 'فروش'} ${input.kilograms} کیلو ${material.name}`
        })
        .run().lastInsertRowid
    )
    tx.update(schema.materialLines).set({ transactionId: txId }).where(eq(schema.materialLines.id, lineId)).run()
    return lineId
  })
}

/** TEMPORARY: headless probe — create a lot, buy 10kg, sell 4kg; check stock + profit. */
export function probeMaterials(db: DB): MaterialDetailView | null {
  const ids = db.select({ id: schema.clients.id }).from(schema.clients).orderBy(schema.clients.id).all()
  const A = ids[0]?.id ?? 0
  const B = ids[1]?.id ?? A
  const id = createMaterial(db, { name: 'M-PROBE', currency: 'AFN' })
  addMaterialLine(db, { materialId: id, direction: 'buy', clientId: A, kilograms: 10, pricePerKgCents: 5000 })
  addMaterialLine(db, { materialId: id, direction: 'sell', clientId: B, kilograms: 4, pricePerKgCents: 9000 })
  return getMaterial(db, id)
}

/**
 * "Delete" a material line, keeping money correct: post a reversal for the
 * line's ledger transaction (unless already reversed), then soft-delete the
 * line so it stops counting toward stock/profit. The row itself must remain —
 * the immutable transaction references it (FKs are ON).
 */
export function removeMaterialLine(db: DB, lineId: number): { ok: boolean; reason?: string } {
  return db.transaction((tx) => {
    const line = tx.select().from(schema.materialLines).where(eq(schema.materialLines.id, lineId)).get()
    if (!line || line.deleted) return { ok: false, reason: 'not_found' }
    if (line.transactionId != null) {
      const alreadyReversed = tx
        .select({ c: sql<number>`COUNT(*)` })
        .from(schema.transactions)
        .where(eq(schema.transactions.reversesTransactionId, line.transactionId))
        .get()
      if (Number(alreadyReversed?.c ?? 0) === 0) {
        reverseTransaction(tx as unknown as DB, line.transactionId)
      }
    }
    tx.update(schema.materialLines)
      .set({ deleted: true, deletedAt: Date.now() })
      .where(eq(schema.materialLines.id, lineId))
      .run()
    return { ok: true }
  })
}

export function registerMaterialsIpc(getDb: () => DB): void {
  ipcMain.handle('materials:list', (_e, params: MaterialsListParams) => listMaterials(getDb(), params))
  ipcMain.handle('materials:get', (_e, id: number) => getMaterial(getDb(), id))
  ipcMain.handle('materials:create', (_e, input: MaterialInput) => createMaterial(getDb(), input))
  ipcMain.handle('materials:addLine', (_e, input: MaterialLineInput) => addMaterialLine(getDb(), input))
  ipcMain.handle('materials:removeLine', (_e, lineId: number) => removeMaterialLine(getDb(), lineId))

  // Rename only — the currency is locked once chosen (lines inherit it).
  ipcMain.handle('materials:update', (_e, id: number, input: MaterialInput): void => {
    const name = input.name.trim()
    if (!name) throw new Error('Material name is required')
    getDb().update(schema.materials).set({ name }).where(eq(schema.materials.id, id)).run()
  })

  // Hard delete — ONLY for material lots with no lines at all (deleted lines
  // included: their rows are still referenced by ledger transactions).
  ipcMain.handle('materials:remove', (_e, id: number): { ok: boolean; reason?: string } => {
    const db = getDb()
    const lineCount = db
      .select({ c: sql<number>`COUNT(*)` })
      .from(schema.materialLines)
      .where(eq(schema.materialLines.materialId, id))
      .get()
    if (Number(lineCount?.c ?? 0) > 0) return { ok: false, reason: 'has_lines' }
    db.delete(schema.materials).where(eq(schema.materials.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('materials:archive', (_e, id: number) => {
    getDb().update(schema.materials).set({ archived: true, archivedAt: Date.now() }).where(eq(schema.materials.id, id)).run()
  })
  ipcMain.handle('materials:restore', (_e, id: number) => {
    getDb().update(schema.materials).set({ archived: false, archivedAt: null }).where(eq(schema.materials.id, id)).run()
  })
}
