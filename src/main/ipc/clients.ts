import { ipcMain } from 'electron'
import { and, or, eq, like, inArray, gte, lte, asc, desc, sql, type SQL, type AnyColumn } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { reverseTransaction, postTransaction } from '../accounting/ledger'
import { logChange } from '../changeLog'
import { postingAmountCents, type PerCurrency, type Currency } from '../../shared/accounting'
import type {
  ClientProfileInput,
  ClientsListParams,
  ClientsListResult,
  ClientListItem,
  ClientTransactionsParams,
  ClientTransactionsResult,
  TransactionView,
  PaymentInput
} from '../../shared/contracts'

type DB = BetterSQLite3Database<typeof schema>
/** A drizzle transaction handle — same query surface as the root DB. */
type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]

const zeroBalances = (): PerCurrency => ({ AFN: 0, USD: 0 })

/** Per-currency balances for a single client (SUM of signed amounts in SQL). */
function balancesForClient(db: DB, clientId: number): PerCurrency {
  const rows = db
    .select({
      currency: schema.transactions.currency,
      sum: sql<number>`COALESCE(SUM(${schema.transactions.amountCents}), 0)`
    })
    .from(schema.transactions)
    .where(eq(schema.transactions.clientId, clientId))
    .groupBy(schema.transactions.currency)
    .all()
  const out = zeroBalances()
  for (const r of rows) out[r.currency as Currency] = Number(r.sum)
  return out
}

/** Per-currency balances for many clients at once (single grouped query). */
function balancesForClients(db: DB, ids: number[]): Map<number, PerCurrency> {
  const map = new Map<number, PerCurrency>()
  if (ids.length === 0) return map
  const rows = db
    .select({
      clientId: schema.transactions.clientId,
      currency: schema.transactions.currency,
      sum: sql<number>`COALESCE(SUM(${schema.transactions.amountCents}), 0)`
    })
    .from(schema.transactions)
    .where(inArray(schema.transactions.clientId, ids))
    .groupBy(schema.transactions.clientId, schema.transactions.currency)
    .all()
  for (const r of rows) {
    const b = map.get(r.clientId) ?? zeroBalances()
    b[r.currency as Currency] = Number(r.sum)
    map.set(r.clientId, b)
  }
  return map
}

function toListItem(row: schema.ClientRow, balances: PerCurrency): ClientListItem {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    notes: row.notes,
    kind: row.kind,
    archived: row.archived,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    balances
  }
}

/**
 * Add a flexible (partial / installment) payment as an IMMUTABLE transaction.
 * Direction encodes who paid whom; the sign convention reduces the open balance
 * for that currency. AFN and USD never mix.
 */
export function addPayment(db: DB | Tx, input: PaymentInput): number {
  const kind = input.direction === 'fromClient' ? 'paymentFromClient' : 'paymentToClient'
  return postTransaction(db, {
    clientId: input.clientId,
    type: 'payment',
    currency: input.currency,
    amountCents: postingAmountCents({ kind, amountCents: input.amountCents }),
    transactionDate: input.transactionDate ?? Date.now(),
    note: input.note ?? null
  })
}

/** Whitelisted sort columns for the statement view. */
const TX_SORTS: Record<string, SQL | AnyColumn> = {
  transactionDate: schema.transactions.transactionDate,
  type: schema.transactions.type,
  currency: schema.transactions.currency,
  amountCents: schema.transactions.amountCents,
  createdAt: schema.transactions.createdAt
}

/** Statement query (client transactions with carpet/material labels). */
export function queryTransactions(db: DB, params: ClientTransactionsParams): ClientTransactionsResult {
  const conds: (SQL | undefined)[] = [eq(schema.transactions.clientId, params.clientId)]
  if (params.type && params.type !== 'all') {
    conds.push(eq(schema.transactions.type, params.type))
  }
  if (params.fromDate != null) conds.push(gte(schema.transactions.transactionDate, params.fromDate))
  if (params.toDate != null) conds.push(lte(schema.transactions.transactionDate, params.toDate))
  // The payments tab hides rows that were later reversed (e.g. after an "edit"),
  // so only the live, corrected payment remains visible there. The full
  // statement still shows originals and reversals.
  if (params.excludeReversed) {
    conds.push(
      sql`NOT EXISTS (SELECT 1 FROM transactions r WHERE r.reverses_transaction_id = ${schema.transactions.id})`
    )
  }
  const search = params.search?.trim()
  if (search) {
    const pat = `%${search}%`
    conds.push(
      or(
        like(schema.transactions.note, pat),
        like(schema.carpets.labelNumber, pat),
        like(schema.materials.name, pat),
        like(schema.invoices.number, pat)
      )
    )
  }
  const where = and(...conds)

  const sortCol = TX_SORTS[params.sortBy ?? '']
  const dirFn = params.sortDir === 'asc' ? asc : desc
  const orderCols = sortCol
    ? [dirFn(sortCol), desc(schema.transactions.id)]
    : [
        desc(schema.transactions.transactionDate),
        desc(schema.transactions.createdAt),
        desc(schema.transactions.id)
      ]

  const rows = db
    .select({
      id: schema.transactions.id,
      clientId: schema.transactions.clientId,
      type: schema.transactions.type,
      currency: schema.transactions.currency,
      amountCents: schema.transactions.amountCents,
      transactionDate: schema.transactions.transactionDate,
      createdAt: schema.transactions.createdAt,
      note: schema.transactions.note,
      carpetId: schema.transactions.carpetId,
      materialLineId: schema.transactions.materialLineId,
      invoiceId: schema.transactions.invoiceId,
      reversesTransactionId: schema.transactions.reversesTransactionId,
      carpetLabel: schema.carpets.labelNumber,
      materialName: schema.materials.name,
      invoiceNumber: schema.invoices.number
    })
    .from(schema.transactions)
    .leftJoin(schema.carpets, eq(schema.transactions.carpetId, schema.carpets.id))
    .leftJoin(schema.materialLines, eq(schema.transactions.materialLineId, schema.materialLines.id))
    .leftJoin(schema.materials, eq(schema.materialLines.materialId, schema.materials.id))
    .leftJoin(schema.invoices, eq(schema.transactions.invoiceId, schema.invoices.id))
    .where(where)
    .orderBy(...orderCols)
    .limit(params.limit)
    .offset(params.offset)
    .all()

  // The count needs the same joins as the page query: the search condition may
  // reference the joined carpet/material columns.
  const totalRow = db
    .select({ c: sql<number>`COUNT(*)` })
    .from(schema.transactions)
    .leftJoin(schema.carpets, eq(schema.transactions.carpetId, schema.carpets.id))
    .leftJoin(schema.materialLines, eq(schema.transactions.materialLineId, schema.materialLines.id))
    .leftJoin(schema.materials, eq(schema.materialLines.materialId, schema.materials.id))
    .leftJoin(schema.invoices, eq(schema.transactions.invoiceId, schema.invoices.id))
    .where(where)
    .get()
  return { rows: rows as TransactionView[], total: Number(totalRow?.c ?? 0) }
}

/** Signed per-currency balance as a correlated subquery (for ORDER BY). */
const balanceSort = (currency: Currency): SQL =>
  sql`(SELECT COALESCE(SUM(t.amount_cents), 0) FROM transactions t WHERE t.client_id = ${schema.clients.id} AND t.currency = ${currency})`

/** Whitelisted sort columns for the clients list. */
const CLIENT_SORTS: Record<string, SQL | AnyColumn> = {
  name: schema.clients.name,
  phone: schema.clients.phone,
  createdAt: schema.clients.createdAt,
  balanceUSD: balanceSort('USD'),
  balanceAFN: balanceSort('AFN')
}

/** List clients (with balances) — extracted so a headless probe can reuse it. */
export function listClients(db: DB, params: ClientsListParams): ClientsListResult {
  const conds: (SQL | undefined)[] = []
  if (!params.includeArchived) conds.push(eq(schema.clients.archived, false))
  // Role filter: buyer/seller screens also show 'both'-kind unified accounts;
  // tar sellers («تار فروشان») are a separate role and match exactly.
  if (params.kind) {
    conds.push(
      params.kind === 'tar_seller'
        ? eq(schema.clients.kind, 'tar_seller')
        : or(eq(schema.clients.kind, params.kind), eq(schema.clients.kind, 'both'))
    )
  }
  const search = params.search?.trim()
  if (search) {
    const pat = `%${search}%`
    conds.push(or(like(schema.clients.name, pat), like(schema.clients.phone, pat)))
  }
  const where = conds.length ? and(...conds) : undefined

  const sortCol = CLIENT_SORTS[params.sortBy ?? ''] ?? schema.clients.name
  const dirFn = params.sortDir === 'desc' ? desc : asc

  const rows = db
    .select()
    .from(schema.clients)
    .where(where)
    .orderBy(dirFn(sortCol), asc(schema.clients.id))
    .limit(params.limit)
    .offset(params.offset)
    .all()

  const totalRow = db.select({ c: sql<number>`COUNT(*)` }).from(schema.clients).where(where).get()
  const balMap = balancesForClients(db, rows.map((r) => r.id))
  return {
    rows: rows.map((r) => toListItem(r, balMap.get(r.id) ?? zeroBalances())),
    total: Number(totalRow?.c ?? 0)
  }
}

/** TEMPORARY: headless probe exercising the clients IPC data path. */
export function probeClients(db: DB): {
  list: ClientsListResult
  firstClientTransactions: ClientTransactionsResult
} {
  const list = listClients(db, { includeArchived: true, limit: 100, offset: 0 })
  const firstId = list.rows[0]?.id ?? 0
  const firstClientTransactions = queryTransactions(db, { clientId: firstId, limit: 100, offset: 0 })
  return { list, firstClientTransactions }
}

export function registerClientsIpc(getDb: () => DB): void {
  ipcMain.handle('clients:list', (_e, params: ClientsListParams): ClientsListResult =>
    listClients(getDb(), params)
  )

  ipcMain.handle('clients:get', (_e, id: number): ClientListItem | null => {
    const db = getDb()
    const row = db.select().from(schema.clients).where(eq(schema.clients.id, id)).get()
    if (!row) return null
    return toListItem(row, balancesForClient(db, id))
  })

  ipcMain.handle('clients:create', (_e, input: ClientProfileInput): number => {
    const db = getDb()
    const name = input.name.trim()
    if (!name) throw new Error('Client name is required')
    const res = db
      .insert(schema.clients)
      .values({
        name,
        phone: input.phone?.trim() || null,
        notes: input.notes?.trim() || null,
        kind: input.kind ?? 'both',
        createdAt: Date.now()
      })
      .run()
    const id = Number(res.lastInsertRowid)
    const row = db.select().from(schema.clients).where(eq(schema.clients.id, id)).get()
    logChange(db, { entity: 'client', entityId: id, action: 'create', summary: name, after: row })
    return id
  })

  // Profile fields only — balances are NEVER edited (they derive from transactions).
  ipcMain.handle('clients:update', (_e, id: number, input: ClientProfileInput): void => {
    const db = getDb()
    const name = input.name.trim()
    if (!name) throw new Error('Client name is required')
    const before = db.select().from(schema.clients).where(eq(schema.clients.id, id)).get()
    db.update(schema.clients)
      .set({
        name,
        phone: input.phone?.trim() || null,
        notes: input.notes?.trim() || null,
        // Only overwrite kind when the caller supplied one (keeps existing role otherwise).
        ...(input.kind ? { kind: input.kind } : {})
      })
      .where(eq(schema.clients.id, id))
      .run()
    const after = db.select().from(schema.clients).where(eq(schema.clients.id, id)).get()
    logChange(db, { entity: 'client', entityId: id, action: 'update', summary: name, before, after })
  })

  // Archive allowed ONLY when BOTH balances are zero (enforced server-side too).
  ipcMain.handle('clients:archive', (_e, id: number): { ok: boolean; reason?: string } => {
    const db = getDb()
    const bal = balancesForClient(db, id)
    if (bal.AFN !== 0 || bal.USD !== 0) {
      return { ok: false, reason: 'balance_nonzero' }
    }
    const before = db.select().from(schema.clients).where(eq(schema.clients.id, id)).get()
    db.update(schema.clients)
      .set({ archived: true, archivedAt: Date.now() })
      .where(eq(schema.clients.id, id))
      .run()
    const after = db.select().from(schema.clients).where(eq(schema.clients.id, id)).get()
    logChange(db, { entity: 'client', entityId: id, action: 'archive', summary: before?.name ?? `#${id}`, before, after })
    return { ok: true }
  })

  ipcMain.handle('clients:restore', (_e, id: number): void => {
    const db = getDb()
    const before = db.select().from(schema.clients).where(eq(schema.clients.id, id)).get()
    db.update(schema.clients)
      .set({ archived: false, archivedAt: null })
      .where(eq(schema.clients.id, id))
      .run()
    const after = db.select().from(schema.clients).where(eq(schema.clients.id, id)).get()
    logChange(db, { entity: 'client', entityId: id, action: 'restore', summary: before?.name ?? `#${id}`, before, after })
  })

  // Hard delete — ONLY for clients with no history at all. Any ledger
  // transaction, carpet link, material line, order or invoice keeps the row
  // (FKs are ON and the ledger is immutable); the UI offers Archive instead.
  ipcMain.handle('clients:remove', (_e, id: number): { ok: boolean; reason?: string } => {
    const db = getDb()
    const count = (q: { c: number } | undefined): number => Number(q?.c ?? 0)
    const refs =
      count(db.select({ c: sql<number>`COUNT(*)` }).from(schema.transactions).where(eq(schema.transactions.clientId, id)).get()) +
      count(
        db
          .select({ c: sql<number>`COUNT(*)` })
          .from(schema.carpets)
          .where(or(eq(schema.carpets.boughtFromClientId, id), eq(schema.carpets.soldToClientId, id)))
          .get()
      ) +
      count(db.select({ c: sql<number>`COUNT(*)` }).from(schema.materialLines).where(eq(schema.materialLines.clientId, id)).get()) +
      count(db.select({ c: sql<number>`COUNT(*)` }).from(schema.orders).where(eq(schema.orders.buyerClientId, id)).get()) +
      count(db.select({ c: sql<number>`COUNT(*)` }).from(schema.invoices).where(eq(schema.invoices.buyerClientId, id)).get())
    if (refs > 0) return { ok: false, reason: 'has_records' }
    const before = db.select().from(schema.clients).where(eq(schema.clients.id, id)).get()
    db.delete(schema.clients).where(eq(schema.clients.id, id)).run()
    logChange(db, { entity: 'client', entityId: id, action: 'delete', summary: before?.name ?? `#${id}`, before })
    return { ok: true }
  })

  ipcMain.handle('clients:transactions', (_e, params: ClientTransactionsParams): ClientTransactionsResult =>
    queryTransactions(getDb(), params)
  )

  ipcMain.handle('clients:addPayment', (_e, input: PaymentInput): number => {
    const db = getDb()
    const txId = addPayment(db, input)
    const tx = db.select().from(schema.transactions).where(eq(schema.transactions.id, txId)).get()
    const client = db.select().from(schema.clients).where(eq(schema.clients.id, input.clientId)).get()
    logChange(db, {
      entity: 'transaction',
      entityId: txId,
      action: 'payment',
      summary: `${client?.name ?? `#${input.clientId}`} — ${(input.amountCents / 100).toFixed(2)} ${input.currency}`,
      after: tx
    })
    return txId
  })

  // "Edit" a payment. The ledger is immutable (CLAUDE.md §3), so an edit is
  // implemented as: post a reversal of the original payment + post a corrected
  // payment, both inside one DB transaction. Returns the new payment's id.
  ipcMain.handle('clients:updatePayment', (_e, transactionId: number, input: PaymentInput): number => {
    const db = getDb()
    const original = db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, transactionId))
      .get()
    if (!original) throw new Error(`Transaction #${transactionId} not found`)
    if (original.type !== 'payment') throw new Error('Only payments can be edited')
    if (original.clientId !== input.clientId) throw new Error('Client mismatch')
    const alreadyReversed = db
      .select({ c: sql<number>`COUNT(*)` })
      .from(schema.transactions)
      .where(eq(schema.transactions.reversesTransactionId, transactionId))
      .get()
    if (Number(alreadyReversed?.c ?? 0) > 0) throw new Error('This payment was already reversed')

    const { reversalId, newId } = db.transaction((tx) => ({
      reversalId: reverseTransaction(tx, transactionId),
      newId: addPayment(tx, input)
    }))

    const client = db.select().from(schema.clients).where(eq(schema.clients.id, input.clientId)).get()
    const reversal = db.select().from(schema.transactions).where(eq(schema.transactions.id, reversalId)).get()
    const newTx = db.select().from(schema.transactions).where(eq(schema.transactions.id, newId)).get()
    // Two log entries mirroring what actually happened, so the undo engine's
    // existing 'reverse'/'payment' handling applies to each posted row.
    logChange(db, {
      entity: 'transaction',
      entityId: transactionId,
      action: 'reverse',
      summary: original.note ?? `#${transactionId}`,
      before: original,
      after: reversal
    })
    logChange(db, {
      entity: 'transaction',
      entityId: newId,
      action: 'payment',
      summary: `${client?.name ?? `#${input.clientId}`} — ${(input.amountCents / 100).toFixed(2)} ${input.currency}`,
      after: newTx
    })
    return newId
  })

  // Immutable ledger: a transaction is undone by POSTING a reversal, never edited.
  ipcMain.handle('transactions:reverse', (_e, id: number): number => {
    const db = getDb()
    const original = db.select().from(schema.transactions).where(eq(schema.transactions.id, id)).get()
    const reversalId = reverseTransaction(db, id)
    const reversal = db.select().from(schema.transactions).where(eq(schema.transactions.id, reversalId)).get()
    logChange(db, {
      entity: 'transaction',
      entityId: id,
      action: 'reverse',
      summary: original?.note ?? `#${id}`,
      before: original,
      after: reversal
    })
    return reversalId
  })
}
