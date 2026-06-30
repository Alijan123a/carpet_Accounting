import { ipcMain } from 'electron'
import { and, or, eq, like, isNotNull, desc, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { getClientBalances } from '../accounting/ledger'
import { addPayment } from './clients'
import { carpetTotalPriceCents, carpetProfitCents, postingAmountCents } from '../../shared/accounting'
import type {
  CarpetInput,
  CarpetEditInput,
  CarpetListItem,
  CarpetDetailView,
  CarpetsListParams,
  CarpetsListResult,
  CarpetStatus,
  CarpetStatusInput,
  CarpetSellInput
} from '../../shared/contracts'

type DB = BetterSQLite3Database<typeof schema>

function isUniqueViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.includes('UNIQUE constraint failed')
}

/** Derive sold flag + profit (null when unsold) from a carpet row. */
function deriveProfit(row: schema.CarpetRow): { sold: boolean; profitCents: number | null } {
  const sold = row.sellPricePerMeterCents != null
  const profitCents = carpetProfitCents({
    area: row.area,
    currency: row.currency,
    buyPricePerMeterCents: row.pricePerMeterCents,
    buyDeductionCents: row.sortDeductionCents,
    sellPricePerMeterCents: row.sellPricePerMeterCents,
    sellDeductionCents: row.sellSortDeductionCents
  })
  return { sold, profitCents }
}

function toListItem(row: schema.CarpetRow): CarpetListItem {
  const { sold, profitCents } = deriveProfit(row)
  return {
    id: row.id,
    labelNumber: row.labelNumber,
    length: row.length,
    width: row.width,
    area: row.area,
    sortGrade: row.sortGrade,
    currency: row.currency,
    pricePerMeterCents: row.pricePerMeterCents,
    sortDeductionCents: row.sortDeductionCents,
    totalPriceCents: row.totalPriceCents,
    status: row.status,
    archived: row.archived,
    sold,
    profitCents
  }
}

export function listCarpets(db: DB, params: CarpetsListParams): CarpetsListResult {
  const conds: (SQL | undefined)[] = []
  if (!params.includeArchived) conds.push(eq(schema.carpets.archived, false))
  if (params.status && params.status !== 'all') conds.push(eq(schema.carpets.status, params.status))
  if (params.sortGrade && params.sortGrade !== 'all') conds.push(eq(schema.carpets.sortGrade, params.sortGrade))
  const search = params.search?.trim()
  if (search) conds.push(or(like(schema.carpets.labelNumber, `%${search}%`), like(schema.carpets.sortGrade, `%${search}%`)))
  const where = conds.length ? and(...conds) : undefined

  const rows = db
    .select()
    .from(schema.carpets)
    .where(where)
    .orderBy(desc(schema.carpets.createdAt))
    .limit(params.limit)
    .offset(params.offset)
    .all()
  const totalRow = db.select({ c: sql<number>`COUNT(*)` }).from(schema.carpets).where(where).get()
  return { rows: rows.map(toListItem), total: Number(totalRow?.c ?? 0) }
}

export function getCarpet(db: DB, id: number): CarpetDetailView | null {
  const boughtClient = alias(schema.clients, 'bought_client')
  const soldClient = alias(schema.clients, 'sold_client')
  const row = db
    .select({
      carpet: schema.carpets,
      boughtFromName: boughtClient.name,
      soldToName: soldClient.name
    })
    .from(schema.carpets)
    .leftJoin(boughtClient, eq(schema.carpets.boughtFromClientId, boughtClient.id))
    .leftJoin(soldClient, eq(schema.carpets.soldToClientId, soldClient.id))
    .where(eq(schema.carpets.id, id))
    .get()
  if (!row) return null
  const c = row.carpet
  const base = toListItem(c)
  return {
    ...base,
    createdAt: c.createdAt,
    hasBuyTransaction: c.buyTransactionId != null,
    boughtFromClientId: c.boughtFromClientId,
    boughtFromName: row.boughtFromName,
    buyTransactionId: c.buyTransactionId,
    soldToClientId: c.soldToClientId,
    soldToName: row.soldToName,
    sellPricePerMeterCents: c.sellPricePerMeterCents,
    sellSortDeductionCents: c.sellSortDeductionCents,
    sellTotalPriceCents: c.sellTotalPriceCents,
    sellTransactionId: c.sellTransactionId,
    soldAt: c.soldAt
  }
}

/**
 * Create a carpet. If a seller is given, the matching IMMUTABLE purchase
 * transaction is posted in the SAME db transaction so stock and ledger can
 * never drift apart (CLAUDE.md). Money uses integer cents.
 */
export function createCarpet(db: DB, input: CarpetInput): { ok: boolean; id?: number; reason?: string } {
  const area = input.length * input.width
  const totalCents = carpetTotalPriceCents(input.pricePerMeterCents, input.sortDeductionCents, area)
  const now = Date.now()
  try {
    const id = db.transaction((tx) => {
      const carpetId = Number(
        tx
          .insert(schema.carpets)
          .values({
            labelNumber: input.labelNumber.trim(),
            length: input.length,
            width: input.width,
            area,
            sortGrade: input.sortGrade?.trim() || null,
            pricePerMeterCents: input.pricePerMeterCents,
            sortDeductionCents: input.sortDeductionCents,
            currency: input.currency,
            totalPriceCents: totalCents,
            status: input.status || 'in_warehouse',
            boughtFromClientId: input.boughtFromClientId ?? null,
            createdAt: now
          })
          .run().lastInsertRowid
      )

      if (input.boughtFromClientId) {
        const buyTxId = Number(
          tx
            .insert(schema.transactions)
            .values({
              clientId: input.boughtFromClientId,
              type: 'purchase',
              currency: input.currency,
              amountCents: postingAmountCents({ kind: 'purchase', amountCents: totalCents }),
              carpetId,
              transactionDate: input.transactionDate ?? now,
              createdAt: now,
              note: `Bought carpet ${input.labelNumber.trim()}`
            })
            .run().lastInsertRowid
        )
        tx.update(schema.carpets).set({ buyTransactionId: buyTxId }).where(eq(schema.carpets.id, carpetId)).run()
      }
      return carpetId
    })
    return { ok: true, id }
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, reason: 'label_taken' }
    throw e
  }
}

/**
 * Edit a carpet. Once a purchase transaction is recorded, financial fields are
 * locked (only label / sort grade / status change) so the posted ledger entry
 * stays correct. Otherwise the full attributes (and total) are recomputed.
 */
export function updateCarpet(db: DB, id: number, input: CarpetEditInput): { ok: boolean; reason?: string } {
  const existing = db.select().from(schema.carpets).where(eq(schema.carpets.id, id)).get()
  if (!existing) return { ok: false, reason: 'not_found' }
  try {
    if (existing.buyTransactionId != null) {
      db.update(schema.carpets)
        .set({ labelNumber: input.labelNumber.trim(), sortGrade: input.sortGrade?.trim() || null, status: input.status })
        .where(eq(schema.carpets.id, id))
        .run()
    } else {
      const area = input.length * input.width
      const totalCents = carpetTotalPriceCents(input.pricePerMeterCents, input.sortDeductionCents, area)
      db.update(schema.carpets)
        .set({
          labelNumber: input.labelNumber.trim(),
          length: input.length,
          width: input.width,
          area,
          sortGrade: input.sortGrade?.trim() || null,
          currency: input.currency,
          pricePerMeterCents: input.pricePerMeterCents,
          sortDeductionCents: input.sortDeductionCents,
          totalPriceCents: totalCents,
          status: input.status
        })
        .where(eq(schema.carpets.id, id))
        .run()
    }
    return { ok: true }
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, reason: 'label_taken' }
    throw e
  }
}

/**
 * Sell an in-warehouse carpet: records the sell side, marks it sold, and posts
 * the IMMUTABLE sale transaction in the buyer's account — all in one db
 * transaction. The sale currency is the carpet's own currency (a carpet has a
 * single currency, so buy/sell profit stays coherent and AFN/USD never mix).
 */
export function sellCarpet(db: DB, input: CarpetSellInput): { ok: boolean; reason?: string } {
  const carpet = db.select().from(schema.carpets).where(eq(schema.carpets.id, input.carpetId)).get()
  if (!carpet) return { ok: false, reason: 'not_found' }
  if (carpet.sellTransactionId != null) return { ok: false, reason: 'already_sold' }

  const sellTotal = carpetTotalPriceCents(input.sellPricePerMeterCents, input.sellSortDeductionCents, carpet.area)
  const now = Date.now()
  db.transaction((tx) => {
    const txId = Number(
      tx
        .insert(schema.transactions)
        .values({
          clientId: input.buyerClientId,
          type: 'sale',
          currency: carpet.currency,
          amountCents: postingAmountCents({ kind: 'sale', amountCents: sellTotal }),
          carpetId: carpet.id,
          transactionDate: input.transactionDate ?? now,
          createdAt: now,
          note: `Sold carpet ${carpet.labelNumber}`
        })
        .run().lastInsertRowid
    )
    tx
      .update(schema.carpets)
      .set({
        status: 'sold',
        sellPricePerMeterCents: input.sellPricePerMeterCents,
        sellSortDeductionCents: input.sellSortDeductionCents,
        sellTotalPriceCents: sellTotal,
        soldToClientId: input.buyerClientId,
        sellTransactionId: txId,
        soldAt: now
      })
      .where(eq(schema.carpets.id, carpet.id))
      .run()
  })
  return { ok: true }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'status'
  )
}

function listStatuses(db: DB): CarpetStatus[] {
  return db.select().from(schema.carpetStatuses).orderBy(schema.carpetStatuses.id).all()
}

export function registerCarpetsIpc(getDb: () => DB): void {
  ipcMain.handle('carpets:list', (_e, params: CarpetsListParams) => listCarpets(getDb(), params))
  ipcMain.handle('carpets:get', (_e, id: number) => getCarpet(getDb(), id))
  ipcMain.handle('carpets:create', (_e, input: CarpetInput) => createCarpet(getDb(), input))
  ipcMain.handle('carpets:update', (_e, id: number, input: CarpetEditInput) => updateCarpet(getDb(), id, input))
  ipcMain.handle('carpets:sell', (_e, input: CarpetSellInput) => sellCarpet(getDb(), input))

  // A carpet is only sensibly archived once it has been SOLD (CLAUDE.md / Phase 6).
  ipcMain.handle('carpets:archive', (_e, id: number): { ok: boolean; reason?: string } => {
    const db = getDb()
    const carpet = db.select().from(schema.carpets).where(eq(schema.carpets.id, id)).get()
    if (!carpet) return { ok: false, reason: 'not_found' }
    if (carpet.sellTransactionId == null) return { ok: false, reason: 'not_sold' }
    db.update(schema.carpets).set({ archived: true, archivedAt: Date.now() }).where(eq(schema.carpets.id, id)).run()
    return { ok: true }
  })
  ipcMain.handle('carpets:restore', (_e, id: number) => {
    getDb().update(schema.carpets).set({ archived: false, archivedAt: null }).where(eq(schema.carpets.id, id)).run()
  })

  ipcMain.handle('carpets:sortGrades', (): string[] => {
    const rows = getDb()
      .selectDistinct({ g: schema.carpets.sortGrade })
      .from(schema.carpets)
      .where(isNotNull(schema.carpets.sortGrade))
      .all()
    return rows.map((r) => r.g).filter((g): g is string => !!g)
  })

  // --- Carpet statuses (user-extendable) ---
  ipcMain.handle('carpetStatuses:list', () => listStatuses(getDb()))

  ipcMain.handle('carpetStatuses:create', (_e, input: CarpetStatusInput): { ok: boolean; reason?: string } => {
    const db = getDb()
    const labelEn = input.labelEn.trim()
    const labelFa = input.labelFa.trim()
    if (!labelEn || !labelFa) return { ok: false, reason: 'labels_required' }
    const existingKeys = new Set(listStatuses(db).map((s) => s.key))
    let key = slugify(labelEn)
    let n = 2
    while (existingKeys.has(key)) key = `${slugify(labelEn)}_${n++}`
    db.insert(schema.carpetStatuses).values({ key, labelFa, labelEn, isDefault: false }).run()
    return { ok: true }
  })

  ipcMain.handle('carpetStatuses:rename', (_e, id: number, input: CarpetStatusInput): void => {
    getDb()
      .update(schema.carpetStatuses)
      .set({ labelFa: input.labelFa.trim(), labelEn: input.labelEn.trim() })
      .where(eq(schema.carpetStatuses.id, id))
      .run()
  })

  ipcMain.handle('carpetStatuses:remove', (_e, id: number): { ok: boolean; reason?: string } => {
    const db = getDb()
    const status = db.select().from(schema.carpetStatuses).where(eq(schema.carpetStatuses.id, id)).get()
    if (!status) return { ok: false, reason: 'not_found' }
    if (status.isDefault) return { ok: false, reason: 'default' }
    const inUse = db.select({ c: sql<number>`COUNT(*)` }).from(schema.carpets).where(eq(schema.carpets.status, status.key)).get()
    if (Number(inUse?.c ?? 0) > 0) return { ok: false, reason: 'in_use' }
    db.delete(schema.carpetStatuses).where(eq(schema.carpetStatuses.id, id)).run()
    return { ok: true }
  })
}

/** TEMPORARY: headless probe — create a bought carpet and check the ledger moved. */
export function probeCarpets(db: DB): {
  created: CarpetDetailView | null
  sellerBalanceBefore: number
  sellerBalanceAfter: number
} {
  const sellerId = db.select({ id: schema.clients.id }).from(schema.clients).orderBy(schema.clients.id).get()?.id ?? 0
  const before = getClientBalances(db, sellerId).AFN
  const res = createCarpet(db, {
    labelNumber: 'C-PROBE',
    length: 2.5,
    width: 3,
    sortGrade: 'A',
    currency: 'AFN',
    pricePerMeterCents: 100000, // 1000.00/m
    sortDeductionCents: 5000, // 50.00 deduction -> effective 950.00/m
    status: 'in_warehouse',
    boughtFromClientId: sellerId,
    transactionDate: Date.now()
  })
  const created = res.id ? getCarpet(db, res.id) : null
  const after = getClientBalances(db, sellerId).AFN
  return { created, sellerBalanceBefore: before, sellerBalanceAfter: after }
}

/**
 * TEMPORARY: end-to-end probe — buy a carpet from client A, sell it to client B,
 * take a partial payment from B; report both AFN balances (before/after) and the
 * carpet profit.
 */
export function probeFullFlow(db: DB): {
  carpetLabel: string
  carpetProfitCents: number | null
  aBeforeAFN: number
  aAfterAFN: number
  bBeforeAFN: number
  bAfterAFN: number
} {
  const ids = db.select({ id: schema.clients.id }).from(schema.clients).orderBy(schema.clients.id).all()
  const A = ids[0]?.id ?? 0 // supplier
  const B = ids[1]?.id ?? A // buyer
  const now = Date.now()
  const aBeforeAFN = getClientBalances(db, A).AFN
  const bBeforeAFN = getClientBalances(db, B).AFN

  const created = createCarpet(db, {
    labelNumber: 'C-FLOW',
    length: 2,
    width: 3, // area 6
    sortGrade: 'A',
    currency: 'AFN',
    pricePerMeterCents: 80000, // buy 800.00/m -> total 4800.00
    sortDeductionCents: 0,
    status: 'in_warehouse',
    boughtFromClientId: A,
    transactionDate: now
  })
  const carpetId = created.id ?? 0
  sellCarpet(db, {
    carpetId,
    buyerClientId: B,
    sellPricePerMeterCents: 120000, // sell 1200.00/m -> total 7200.00 -> profit 2400.00
    sellSortDeductionCents: 0,
    transactionDate: now
  })
  addPayment(db, { clientId: B, currency: 'AFN', amountCents: 200000, direction: 'fromClient', transactionDate: now })

  const detail = getCarpet(db, carpetId)
  return {
    carpetLabel: 'C-FLOW',
    carpetProfitCents: detail?.profitCents ?? null,
    aBeforeAFN,
    aAfterAFN: getClientBalances(db, A).AFN,
    bBeforeAFN,
    bAfterAFN: getClientBalances(db, B).AFN
  }
}
