import { ipcMain } from 'electron'
import { and, or, eq, like, inArray, asc, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
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

export function listMaterials(db: DB, params: MaterialsListParams): MaterialsListResult {
  const conds: (SQL | undefined)[] = []
  if (!params.includeArchived) conds.push(eq(schema.materials.archived, false))
  const search = params.search?.trim()
  if (search) conds.push(or(like(schema.materials.name, `%${search}%`)))
  const where = conds.length ? and(...conds) : undefined

  const rows = db
    .select()
    .from(schema.materials)
    .where(where)
    .orderBy(asc(schema.materials.name))
    .limit(params.limit)
    .offset(params.offset)
    .all()
  const totalRow = db.select({ c: sql<number>`COUNT(*)` }).from(schema.materials).where(where).get()

  const ids = rows.map((r) => r.id)
  const lines = ids.length
    ? db.select().from(schema.materialLines).where(inArray(schema.materialLines.materialId, ids)).all()
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
  const lineRows = db.select().from(schema.materialLines).where(eq(schema.materialLines.materialId, id)).all()
  const s = summarize(lineRows)

  const client = alias(schema.clients, 'ml_client')
  const joined = db
    .select({ line: schema.materialLines, clientName: client.name })
    .from(schema.materialLines)
    .leftJoin(client, eq(schema.materialLines.clientId, client.id))
    .where(eq(schema.materialLines.materialId, id))
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

export function registerMaterialsIpc(getDb: () => DB): void {
  ipcMain.handle('materials:list', (_e, params: MaterialsListParams) => listMaterials(getDb(), params))
  ipcMain.handle('materials:get', (_e, id: number) => getMaterial(getDb(), id))
  ipcMain.handle('materials:create', (_e, input: MaterialInput) => createMaterial(getDb(), input))
  ipcMain.handle('materials:addLine', (_e, input: MaterialLineInput) => addMaterialLine(getDb(), input))
  ipcMain.handle('materials:archive', (_e, id: number) => {
    getDb().update(schema.materials).set({ archived: true, archivedAt: Date.now() }).where(eq(schema.materials.id, id)).run()
  })
  ipcMain.handle('materials:restore', (_e, id: number) => {
    getDb().update(schema.materials).set({ archived: false, archivedAt: null }).where(eq(schema.materials.id, id)).run()
  })
}
