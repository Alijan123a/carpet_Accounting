import { ipcMain } from 'electron'
import { and, or, eq, like, inArray, gte, lte, desc, sql, type SQL } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { reverseTransaction, postTransaction } from '../accounting/ledger'
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
export function addPayment(db: DB, input: PaymentInput): number {
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

/** Statement query (client transactions with carpet/material labels). */
export function queryTransactions(db: DB, params: ClientTransactionsParams): ClientTransactionsResult {
  const conds = [eq(schema.transactions.clientId, params.clientId)]
  if (params.type && params.type !== 'all') {
    conds.push(eq(schema.transactions.type, params.type))
  }
  if (params.fromDate != null) conds.push(gte(schema.transactions.transactionDate, params.fromDate))
  if (params.toDate != null) conds.push(lte(schema.transactions.transactionDate, params.toDate))
  const where = and(...conds)

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
      reversesTransactionId: schema.transactions.reversesTransactionId,
      carpetLabel: schema.carpets.labelNumber,
      materialName: schema.materials.name
    })
    .from(schema.transactions)
    .leftJoin(schema.carpets, eq(schema.transactions.carpetId, schema.carpets.id))
    .leftJoin(schema.materialLines, eq(schema.transactions.materialLineId, schema.materialLines.id))
    .leftJoin(schema.materials, eq(schema.materialLines.materialId, schema.materials.id))
    .where(where)
    .orderBy(
      desc(schema.transactions.transactionDate),
      desc(schema.transactions.createdAt),
      desc(schema.transactions.id)
    )
    .limit(params.limit)
    .offset(params.offset)
    .all()

  const totalRow = db.select({ c: sql<number>`COUNT(*)` }).from(schema.transactions).where(where).get()
  return { rows: rows as TransactionView[], total: Number(totalRow?.c ?? 0) }
}

/** List clients (with balances) — extracted so a headless probe can reuse it. */
export function listClients(db: DB, params: ClientsListParams): ClientsListResult {
  const conds: (SQL | undefined)[] = []
  if (!params.includeArchived) conds.push(eq(schema.clients.archived, false))
  const search = params.search?.trim()
  if (search) {
    const pat = `%${search}%`
    conds.push(or(like(schema.clients.name, pat), like(schema.clients.phone, pat)))
  }
  const where = conds.length ? and(...conds) : undefined

  const rows = db
    .select()
    .from(schema.clients)
    .where(where)
    .orderBy(schema.clients.name)
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
        createdAt: Date.now()
      })
      .run()
    return Number(res.lastInsertRowid)
  })

  // Profile fields only — balances are NEVER edited (they derive from transactions).
  ipcMain.handle('clients:update', (_e, id: number, input: ClientProfileInput): void => {
    const db = getDb()
    const name = input.name.trim()
    if (!name) throw new Error('Client name is required')
    db.update(schema.clients)
      .set({ name, phone: input.phone?.trim() || null, notes: input.notes?.trim() || null })
      .where(eq(schema.clients.id, id))
      .run()
  })

  // Archive allowed ONLY when BOTH balances are zero (enforced server-side too).
  ipcMain.handle('clients:archive', (_e, id: number): { ok: boolean; reason?: string } => {
    const db = getDb()
    const bal = balancesForClient(db, id)
    if (bal.AFN !== 0 || bal.USD !== 0) {
      return { ok: false, reason: 'balance_nonzero' }
    }
    db.update(schema.clients)
      .set({ archived: true, archivedAt: Date.now() })
      .where(eq(schema.clients.id, id))
      .run()
    return { ok: true }
  })

  ipcMain.handle('clients:restore', (_e, id: number): void => {
    const db = getDb()
    db.update(schema.clients)
      .set({ archived: false, archivedAt: null })
      .where(eq(schema.clients.id, id))
      .run()
  })

  ipcMain.handle('clients:transactions', (_e, params: ClientTransactionsParams): ClientTransactionsResult =>
    queryTransactions(getDb(), params)
  )

  ipcMain.handle('clients:addPayment', (_e, input: PaymentInput): number => addPayment(getDb(), input))

  // Immutable ledger: a transaction is undone by POSTING a reversal, never edited.
  ipcMain.handle('transactions:reverse', (_e, id: number): number => {
    return reverseTransaction(getDb(), id)
  })
}
