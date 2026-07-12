import { ipcMain } from 'electron'
import { and, or, eq, ne, like, inArray, isNull, isNotNull, asc, desc, sql, type SQL, type AnyColumn } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { getClientBalances } from '../accounting/ledger'
import { addPayment } from './clients'
import { logChange } from '../changeLog'
import {
  carpetTotalPriceCents,
  carpetProfitCents,
  invoiceGrandTotalCents,
  postingAmountCents
} from '../../shared/accounting'
import type {
  CarpetInput,
  CarpetEditInput,
  CarpetListItem,
  CarpetDetailView,
  CarpetsListParams,
  CarpetsListResult,
  CarpetsBatchInput,
  CarpetsBatchResult,
  CarpetStatus,
  CarpetStatusInput,
  CarpetSellInput,
  SellInvoiceInput,
  SellInvoiceResult
} from '../../shared/contracts'

type DB = BetterSQLite3Database<typeof schema>

/**
 * DECISION 2 (see the task prompt): saving a sell invoice posts each carpet line
 * to the immutable ledger through the normal sell path, so receivables update
 * exactly like a single sale. Flip to `false` to make the invoice a pure
 * printable document (no ledger movement); the invoice header is still recorded.
 */
const INVOICE_POSTS_TO_LEDGER = true

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]

function isUniqueViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.includes('UNIQUE constraint failed')
}

/** Derive sold flag + profit (null when unsold) from a carpet row. */
function deriveProfit(row: schema.CarpetRow): { sold: boolean; profitCents: number | null } {
  const sold = row.sellPricePerMeterCents != null
  // Prefer the STORED totals — they equal the posted ledger amounts (including
  // an invoice line's overridden «متراژ»/«جمله»). Recomputing from the area is
  // only a fallback for legacy sold rows without a stored sell total.
  const profitCents =
    sold && row.sellTotalPriceCents != null
      ? row.sellTotalPriceCents - row.totalPriceCents
      : carpetProfitCents({
          area: row.area,
          currency: row.currency,
          buyPricePerMeterCents: row.pricePerMeterCents,
          buyDeductionCents: row.sortDeductionCents,
          sellPricePerMeterCents: row.sellPricePerMeterCents,
          sellDeductionCents: row.sellSortDeductionCents
        })
  return { sold, profitCents }
}

function toListItem(row: schema.CarpetRow, dateEpoch?: number | null): CarpetListItem {
  const { sold, profitCents } = deriveProfit(row)
  return {
    id: row.id,
    labelNumber: row.labelNumber,
    length: row.length,
    width: row.width,
    area: row.area,
    sortGrade: row.sortGrade,
    quality: row.quality,
    currency: row.currency,
    pricePerMeterCents: row.pricePerMeterCents,
    sortDeductionCents: row.sortDeductionCents,
    totalPriceCents: row.totalPriceCents,
    status: row.status,
    archived: row.archived,
    sold,
    // Purchase date when the caller joined the buy transaction; else entry date.
    dateEpoch: dateEpoch ?? row.createdAt,
    // Legacy rows may be null; treat missing provenance as stock ('bought').
    origin: row.origin === 'ordered' ? 'ordered' : 'bought',
    profitCents
  }
}

/** Whitelisted sort columns for the carpets list. */
const CARPET_SORTS: Record<string, AnyColumn> = {
  labelNumber: schema.carpets.labelNumber,
  length: schema.carpets.length,
  width: schema.carpets.width,
  area: schema.carpets.area,
  sortGrade: schema.carpets.sortGrade,
  currency: schema.carpets.currency,
  pricePerMeterCents: schema.carpets.pricePerMeterCents,
  sortDeductionCents: schema.carpets.sortDeductionCents,
  totalPriceCents: schema.carpets.totalPriceCents,
  status: schema.carpets.status,
  origin: schema.carpets.origin,
  createdAt: schema.carpets.createdAt
}

export function listCarpets(db: DB, params: CarpetsListParams): CarpetsListResult {
  const conds: (SQL | undefined)[] = []
  if (!params.includeArchived) conds.push(eq(schema.carpets.archived, false))
  if (params.status && params.status !== 'all') conds.push(eq(schema.carpets.status, params.status))
  if (params.sortGrade && params.sortGrade !== 'all') conds.push(eq(schema.carpets.sortGrade, params.sortGrade))
  if (params.origin && params.origin !== 'all') {
    // Legacy rows have NULL origin — treat them as 'bought' for filtering too.
    conds.push(
      params.origin === 'ordered'
        ? eq(schema.carpets.origin, 'ordered')
        : or(eq(schema.carpets.origin, 'bought'), isNull(schema.carpets.origin))
    )
  }
  const search = params.search?.trim()
  if (search) {
    const pat = `%${search}%`
    conds.push(
      or(
        like(schema.carpets.labelNumber, pat),
        like(schema.carpets.sortGrade, pat),
        like(schema.carpets.quality, pat)
      )
    )
  }
  const where = conds.length ? and(...conds) : undefined

  // Buy transaction joined for the display date (user-set purchase date when
  // the carpet was bought on account; otherwise the entry date).
  const buyTx = alias(schema.transactions, 'buy_tx')
  const dateExpr = sql<number>`COALESCE(${buyTx.transactionDate}, ${schema.carpets.createdAt})`

  const dirFn = params.sortDir === 'asc' ? asc : desc
  let orderCols: SQL[]
  if (params.sortBy === 'profitCents') {
    // Profit isn't a stored column; sort by the same value the UI shows —
    // (sell total − buy total). Unsold carpets have NULL sell total → NULL profit.
    const profitExpr = sql`(${schema.carpets.sellTotalPriceCents} - ${schema.carpets.totalPriceCents})`
    orderCols = [dirFn(profitExpr), asc(schema.carpets.id)]
  } else if (params.sortBy === 'dateEpoch') {
    orderCols = [dirFn(dateExpr), asc(schema.carpets.id)]
  } else {
    const sortCol = CARPET_SORTS[params.sortBy ?? '']
    orderCols = sortCol ? [dirFn(sortCol), asc(schema.carpets.id)] : [desc(schema.carpets.createdAt)]
  }

  const rows = db
    .select({ carpet: schema.carpets, dateEpoch: dateExpr })
    .from(schema.carpets)
    .leftJoin(buyTx, eq(schema.carpets.buyTransactionId, buyTx.id))
    .where(where)
    .orderBy(...orderCols)
    .limit(params.limit)
    .offset(params.offset)
    .all()
  const totalRow = db.select({ c: sql<number>`COUNT(*)` }).from(schema.carpets).where(where).get()
  return {
    rows: rows.map((r) => toListItem(r.carpet, Number(r.dateEpoch))),
    total: Number(totalRow?.c ?? 0)
  }
}

export function getCarpet(db: DB, id: number): CarpetDetailView | null {
  const boughtClient = alias(schema.clients, 'bought_client')
  const soldClient = alias(schema.clients, 'sold_client')
  const buyTx = alias(schema.transactions, 'buy_tx')
  const row = db
    .select({
      carpet: schema.carpets,
      boughtFromName: boughtClient.name,
      soldToName: soldClient.name,
      buyDate: buyTx.transactionDate
    })
    .from(schema.carpets)
    .leftJoin(boughtClient, eq(schema.carpets.boughtFromClientId, boughtClient.id))
    .leftJoin(soldClient, eq(schema.carpets.soldToClientId, soldClient.id))
    .leftJoin(buyTx, eq(schema.carpets.buyTransactionId, buyTx.id))
    .where(eq(schema.carpets.id, id))
    .get()
  if (!row) return null
  const c = row.carpet
  const base = toListItem(c, row.buyDate)
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
            quality: input.quality?.trim() || null,
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
              // Auto-note in Dari (single Afghan trader; see CLAUDE.md §6).
              note: `خرید قالین نمبر ${input.labelNumber.trim()}`
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
 * Bulk-add carpets from a bill-style entry. Every carpet is inserted in ONE db
 * transaction; if a seller is given, the matching IMMUTABLE purchase transaction
 * is posted per carpet in the same transaction, so stock and ledger can never
 * drift apart (CLAUDE.md). Either the whole batch commits or nothing does.
 *
 * Labels are validated up front (both within the batch and against existing
 * carpets) so we can report the exact offending label instead of a generic
 * UNIQUE-constraint failure mid-transaction.
 */
export function createCarpetsBatch(db: DB, input: CarpetsBatchInput): CarpetsBatchResult {
  const lines = input.lines.filter((l) => l.labelNumber.trim())
  if (!lines.length) return { ok: false, reason: 'no_lines' }

  // Reject duplicate labels inside the same batch (case-sensitive match on trim).
  const seen = new Set<string>()
  for (const l of lines) {
    const label = l.labelNumber.trim()
    if (seen.has(label)) return { ok: false, reason: 'duplicate_label', label }
    seen.add(label)
  }

  // Reject labels that already exist in the warehouse before we start inserting.
  const existing = db
    .select({ label: schema.carpets.labelNumber })
    .from(schema.carpets)
    .where(inArray(schema.carpets.labelNumber, [...seen]))
    .all()
  if (existing.length) return { ok: false, reason: 'label_taken', label: existing[0].label }

  const now = Date.now()
  const seller = input.boughtFromClientId ?? null
  const txDate = input.transactionDate ?? now

  const createdIds = db.transaction((tx): number[] => {
    const ids: number[] = []
    for (const l of lines) {
      const label = l.labelNumber.trim()
      // Use the user's explicit «متراژ» when given; otherwise derive it (L×W).
      const area = l.area && l.area > 0 ? l.area : l.length * l.width
      // Use the user's explicit total when given; otherwise derive it.
      const totalCents =
        l.totalCents && l.totalCents > 0
          ? l.totalCents
          : carpetTotalPriceCents(l.pricePerMeterCents, l.sortDeductionCents, area)
      const carpetId = Number(
        tx
          .insert(schema.carpets)
          .values({
            labelNumber: label,
            length: l.length,
            width: l.width,
            area,
            sortGrade: l.sortGrade?.trim() || null,
            quality: l.quality?.trim() || null,
            pricePerMeterCents: l.pricePerMeterCents,
            sortDeductionCents: l.sortDeductionCents,
            currency: input.currency,
            totalPriceCents: totalCents,
            // New carpets are always «در انبار» (see CarpetBatchLineInput).
            status: 'in_warehouse',
            // Order-completion batches pass 'ordered'; buy/manual default to 'bought'.
            origin: input.origin ?? 'bought',
            boughtFromClientId: seller,
            createdAt: now
          })
          .run().lastInsertRowid
      )

      if (seller) {
        const buyTxId = Number(
          tx
            .insert(schema.transactions)
            .values({
              clientId: seller,
              type: 'purchase',
              currency: input.currency,
              amountCents: postingAmountCents({ kind: 'purchase', amountCents: totalCents }),
              carpetId,
              transactionDate: txDate,
              createdAt: now,
              // Auto-note in Dari (single Afghan trader; see CLAUDE.md §6).
              note: `خرید قالین نمبر ${label}`
            })
            .run().lastInsertRowid
        )
        tx.update(schema.carpets).set({ buyTransactionId: buyTxId }).where(eq(schema.carpets.id, carpetId)).run()
      }
      ids.push(carpetId)
    }
    return ids
  })
  return { ok: true, created: createdIds.length, ids: createdIds }
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
        .set({
          labelNumber: input.labelNumber.trim(),
          sortGrade: input.sortGrade?.trim() || null,
          quality: input.quality?.trim() || null,
          status: input.status
        })
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
          quality: input.quality?.trim() || null,
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
 * Post ONE carpet sale inside an already-open db transaction: writes the sell
 * columns, marks the carpet sold, and inserts the IMMUTABLE sale transaction in
 * the buyer's account. The sale currency is the carpet's own currency (a carpet
 * has a single currency, so buy/sell profit stays coherent and AFN/USD never
 * mix). Shared by the single-sale path and the batch invoice path so the ledger
 * effect is identical either way.
 */
function postCarpetSaleTx(
  tx: Tx,
  carpet: schema.CarpetRow,
  input: CarpetSellInput,
  now: number,
  opts?: { invoiceId?: number; description?: string | null }
): void {
  // An invoice line with an overridden «متراژ»/«جمله» posts exactly what the
  // user saw and printed; otherwise the total derives from the stored area.
  const sellTotal =
    input.sellTotalCentsOverride != null && input.sellTotalCentsOverride > 0
      ? input.sellTotalCentsOverride
      : carpetTotalPriceCents(input.sellPricePerMeterCents, input.sellSortDeductionCents, carpet.area)
  const description = opts?.description?.trim()
  const txId = Number(
    tx
      .insert(schema.transactions)
      .values({
        clientId: input.buyerClientId,
        type: 'sale',
        currency: carpet.currency,
        amountCents: postingAmountCents({ kind: 'sale', amountCents: sellTotal }),
        carpetId: carpet.id,
        invoiceId: opts?.invoiceId ?? null,
        transactionDate: input.transactionDate ?? now,
        createdAt: now,
        // Auto-note in Dari (single Afghan trader; see CLAUDE.md §6). The
        // invoice line's free-text description is appended when present.
        note: description
          ? `فروش قالین نمبر ${carpet.labelNumber} — ${description}`
          : `فروش قالین نمبر ${carpet.labelNumber}`
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
}

/**
 * Sell an in-warehouse carpet: records the sell side, marks it sold, and posts
 * the IMMUTABLE sale transaction in the buyer's account — all in one db
 * transaction.
 */
export function sellCarpet(db: DB, input: CarpetSellInput): { ok: boolean; reason?: string } {
  const carpet = db.select().from(schema.carpets).where(eq(schema.carpets.id, input.carpetId)).get()
  if (!carpet) return { ok: false, reason: 'not_found' }
  if (carpet.sellTransactionId != null) return { ok: false, reason: 'already_sold' }

  const now = Date.now()
  db.transaction((tx) => postCarpetSaleTx(tx, carpet, input, now))
  return { ok: true }
}

/** Suggested next invoice number: sequential over the invoices table. */
export function nextInvoiceNumber(db: DB): string {
  const row = db.select({ m: sql<number>`COALESCE(MAX(${schema.invoices.id}), 0)` }).from(schema.invoices).get()
  return String(Number(row?.m ?? 0) + 1)
}

/**
 * Save a sell invoice atomically. For every line that references a real, unsold
 * in-warehouse carpet we post the sale via {@link postCarpetSaleTx} (unless
 * INVOICE_POSTS_TO_LEDGER is off); free-text lines are print-only. The whole
 * loop plus the invoice-header insert run in ONE db transaction, so either the
 * entire invoice posts or nothing does.
 *
 * Each carpet line posts its total AS PRINTED: the line total (which honours a
 * manually overridden «متراژ»/«جمله») is passed to the sell path as an explicit
 * override, so the invoice, the stored sell total, and the posted ledger sale
 * are always the same number. The carpet's stored dimensions are never mutated.
 */
export function sellInvoice(db: DB, input: SellInvoiceInput): SellInvoiceResult {
  if (!input.buyerClientId) return { ok: false, reason: 'buyer_required' }
  if (!input.lines.length) return { ok: false, reason: 'no_lines' }

  const now = Date.now()
  const txDate = input.transactionDate ?? now
  const printedTotal = invoiceGrandTotalCents(input.lines.map((l) => l.totalCents))

  try {
    const result = db.transaction((tx): { id: number; number: string } => {
      // Insert the invoice header FIRST so each posted sale can reference the
      // invoice id (bill number shows in the client statement).
      const requested = input.number.trim()
      const insertedId = Number(
        tx
          .insert(schema.invoices)
          .values({
            // Placeholder; replaced below once the row id is known. Bill
            // numbers are UNIQUE (idx_invoices_number_unique) and effectively
            // server-assigned — the UI shows a read-only suggestion.
            number: `#tmp-${now}`,
            buyerClientId: input.buyerClientId,
            currency: input.currency,
            totalCents: printedTotal,
            linesJson: JSON.stringify(input.lines),
            transactionDate: txDate,
            createdAt: now
          })
          .run().lastInsertRowid
      )
      // Pick the first FREE number: the requested one if still available,
      // else the row id (suffixed in the pathological case even that is taken).
      const isTaken = (n: string): boolean =>
        tx
          .select({ id: schema.invoices.id })
          .from(schema.invoices)
          .where(and(eq(schema.invoices.number, n), ne(schema.invoices.id, insertedId)))
          .get() != null
      let finalNumber = requested && !isTaken(requested) ? requested : String(insertedId)
      for (let n = 2; isTaken(finalNumber); n++) finalNumber = `${insertedId}-${n}`
      tx.update(schema.invoices).set({ number: finalNumber }).where(eq(schema.invoices.id, insertedId)).run()

      if (INVOICE_POSTS_TO_LEDGER) {
        for (const line of input.lines) {
          if (line.carpetId == null) continue // free-text line: print-only
          const carpet = tx.select().from(schema.carpets).where(eq(schema.carpets.id, line.carpetId)).get()
          if (!carpet) throw new InvoiceError('carpet_not_found')
          if (carpet.sellTransactionId != null) throw new InvoiceError('already_sold')
          if (carpet.currency !== input.currency) throw new InvoiceError('currency_mismatch')
          postCarpetSaleTx(
            tx,
            carpet,
            {
              carpetId: carpet.id,
              buyerClientId: input.buyerClientId,
              // The invoice "unit price / m" maps to the carpet sell price/m; no
              // separate sell deduction on the invoice (see prompt Task B).
              sellPricePerMeterCents: line.unitPriceCents,
              sellSortDeductionCents: 0,
              transactionDate: txDate,
              // Post the line total AS SHOWN — an overridden «متراژ»/«جمله»
              // applies to the ledger, so printed and posted always agree.
              sellTotalCentsOverride: line.totalCents > 0 ? line.totalCents : null
            },
            now,
            { invoiceId: insertedId, description: line.description }
          )
        }
      }
      return { id: insertedId, number: finalNumber }
    })
    return { ok: true, id: result.id, number: result.number, posted: INVOICE_POSTS_TO_LEDGER }
  } catch (e) {
    if (e instanceof InvoiceError) return { ok: false, reason: e.reason }
    throw e
  }
}

/** Typed abort used to roll back the invoice transaction with a stable reason. */
class InvoiceError extends Error {
  constructor(public reason: string) {
    super(reason)
  }
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
  const carpetRow = (db: DB, id: number): schema.CarpetRow | undefined =>
    db.select().from(schema.carpets).where(eq(schema.carpets.id, id)).get()

  ipcMain.handle('carpets:list', (_e, params: CarpetsListParams) => listCarpets(getDb(), params))
  ipcMain.handle('carpets:get', (_e, id: number) => getCarpet(getDb(), id))

  ipcMain.handle('carpets:create', (_e, input: CarpetInput) => {
    const db = getDb()
    const res = createCarpet(db, input)
    if (res.ok && res.id) {
      logChange(db, {
        entity: 'carpet',
        entityId: res.id,
        action: 'create',
        summary: input.labelNumber.trim(),
        after: carpetRow(db, res.id)
      })
    }
    return res
  })

  ipcMain.handle('carpets:createBatch', (_e, input: CarpetsBatchInput) => {
    const db = getDb()
    const res = createCarpetsBatch(db, input)
    if (res.ok && res.ids) {
      for (const id of res.ids) {
        const row = carpetRow(db, id)
        logChange(db, { entity: 'carpet', entityId: id, action: 'create', summary: row?.labelNumber ?? `#${id}`, after: row })
      }
    }
    return res
  })

  ipcMain.handle('carpets:update', (_e, id: number, input: CarpetEditInput) => {
    const db = getDb()
    const before = carpetRow(db, id)
    const res = updateCarpet(db, id, input)
    if (res.ok) {
      const after = carpetRow(db, id)
      logChange(db, { entity: 'carpet', entityId: id, action: 'update', summary: after?.labelNumber ?? `#${id}`, before, after })
    }
    return res
  })

  ipcMain.handle('carpets:sell', (_e, input: CarpetSellInput) => {
    const db = getDb()
    const before = carpetRow(db, input.carpetId)
    const res = sellCarpet(db, input)
    if (res.ok && before) {
      const after = carpetRow(db, input.carpetId)
      const buyer = db.select().from(schema.clients).where(eq(schema.clients.id, input.buyerClientId)).get()
      logChange(db, {
        entity: 'carpet',
        entityId: input.carpetId,
        action: 'sell',
        summary: `${before.labelNumber} → ${buyer?.name ?? `#${input.buyerClientId}`}`,
        before,
        after
      })
    }
    return res
  })

  ipcMain.handle('carpets:nextInvoiceNumber', () => nextInvoiceNumber(getDb()))

  ipcMain.handle('carpets:sellInvoice', (_e, input: SellInvoiceInput) => {
    const db = getDb()
    // Pre-sale snapshots of the real carpets on the invoice (for sell undo).
    const carpetIds = input.lines.map((l) => l.carpetId).filter((x): x is number => x != null)
    const befores = new Map(carpetIds.map((cid) => [cid, carpetRow(db, cid)]))
    const res = sellInvoice(db, input)
    if (res.ok) {
      const buyer = db.select().from(schema.clients).where(eq(schema.clients.id, input.buyerClientId)).get()
      const buyerName = buyer?.name ?? `#${input.buyerClientId}`
      if (res.posted) {
        for (const cid of carpetIds) {
          const before = befores.get(cid)
          const after = carpetRow(db, cid)
          // Only log carpets this invoice actually sold.
          if (before && after && before.sellTransactionId == null && after.sellTransactionId != null) {
            logChange(db, {
              entity: 'carpet',
              entityId: cid,
              action: 'sell',
              summary: `${before.labelNumber} → ${buyerName}`,
              before,
              after
            })
          }
        }
      }
      if (res.id) {
        const inv = db.select().from(schema.invoices).where(eq(schema.invoices.id, res.id)).get()
        logChange(db, {
          entity: 'invoice',
          entityId: res.id,
          action: 'create',
          summary: `#${res.number ?? res.id} — ${buyerName}`,
          after: inv
        })
      }
    }
    return res
  })

  // A carpet is only sensibly archived once it has been SOLD (CLAUDE.md / Phase 6).
  ipcMain.handle('carpets:archive', (_e, id: number): { ok: boolean; reason?: string } => {
    const db = getDb()
    const carpet = db.select().from(schema.carpets).where(eq(schema.carpets.id, id)).get()
    if (!carpet) return { ok: false, reason: 'not_found' }
    if (carpet.sellTransactionId == null) return { ok: false, reason: 'not_sold' }
    db.update(schema.carpets).set({ archived: true, archivedAt: Date.now() }).where(eq(schema.carpets.id, id)).run()
    logChange(db, { entity: 'carpet', entityId: id, action: 'archive', summary: carpet.labelNumber, before: carpet, after: carpetRow(db, id) })
    return { ok: true }
  })
  ipcMain.handle('carpets:restore', (_e, id: number) => {
    const db = getDb()
    const before = carpetRow(db, id)
    db.update(schema.carpets).set({ archived: false, archivedAt: null }).where(eq(schema.carpets.id, id)).run()
    logChange(db, { entity: 'carpet', entityId: id, action: 'restore', summary: before?.labelNumber ?? `#${id}`, before, after: carpetRow(db, id) })
  })

  // Hard delete — ONLY for carpets never touched by the ledger (no purchase or
  // sale transaction, including reversals). Ledger-linked carpets can only be
  // archived; their money history must stay intact (CLAUDE.md §3).
  ipcMain.handle('carpets:remove', (_e, id: number): { ok: boolean; reason?: string } => {
    const db = getDb()
    const carpet = db.select().from(schema.carpets).where(eq(schema.carpets.id, id)).get()
    if (!carpet) return { ok: false, reason: 'not_found' }
    const txCount = db
      .select({ c: sql<number>`COUNT(*)` })
      .from(schema.transactions)
      .where(eq(schema.transactions.carpetId, id))
      .get()
    if (Number(txCount?.c ?? 0) > 0) return { ok: false, reason: 'has_transactions' }
    db.delete(schema.carpets).where(eq(schema.carpets.id, id)).run()
    logChange(db, { entity: 'carpet', entityId: id, action: 'delete', summary: carpet.labelNumber, before: carpet })
    return { ok: true }
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
    const res = db.insert(schema.carpetStatuses).values({ key, labelFa, labelEn, isDefault: false }).run()
    const newId = Number(res.lastInsertRowid)
    const row = db.select().from(schema.carpetStatuses).where(eq(schema.carpetStatuses.id, newId)).get()
    logChange(db, { entity: 'carpet_status', entityId: newId, action: 'create', summary: labelFa, after: row })
    return { ok: true }
  })

  ipcMain.handle('carpetStatuses:rename', (_e, id: number, input: CarpetStatusInput): void => {
    const db = getDb()
    const before = db.select().from(schema.carpetStatuses).where(eq(schema.carpetStatuses.id, id)).get()
    db.update(schema.carpetStatuses)
      .set({ labelFa: input.labelFa.trim(), labelEn: input.labelEn.trim() })
      .where(eq(schema.carpetStatuses.id, id))
      .run()
    const after = db.select().from(schema.carpetStatuses).where(eq(schema.carpetStatuses.id, id)).get()
    logChange(db, { entity: 'carpet_status', entityId: id, action: 'update', summary: input.labelFa.trim(), before, after })
  })

  ipcMain.handle('carpetStatuses:remove', (_e, id: number): { ok: boolean; reason?: string } => {
    const db = getDb()
    const status = db.select().from(schema.carpetStatuses).where(eq(schema.carpetStatuses.id, id)).get()
    if (!status) return { ok: false, reason: 'not_found' }
    if (status.isDefault) return { ok: false, reason: 'default' }
    const inUse = db.select({ c: sql<number>`COUNT(*)` }).from(schema.carpets).where(eq(schema.carpets.status, status.key)).get()
    if (Number(inUse?.c ?? 0) > 0) return { ok: false, reason: 'in_use' }
    db.delete(schema.carpetStatuses).where(eq(schema.carpetStatuses.id, id)).run()
    logChange(db, { entity: 'carpet_status', entityId: id, action: 'delete', summary: status.labelFa, before: status })
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
