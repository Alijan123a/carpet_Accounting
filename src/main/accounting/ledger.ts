import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import {
  clientBalances,
  buildReversal,
  type LedgerTransaction,
  type PerCurrency
} from '../../shared/accounting'

type DB = BetterSQLite3Database<typeof schema>

/**
 * Main-process ledger: all DB reads/writes delegate the actual accounting math
 * to the pure engine in src/shared/accounting. This layer only does I/O.
 */

/** Insert a (already-signed) transaction and return its new id. */
export function postTransaction(db: DB, payload: LedgerTransaction): number {
  const res = db
    .insert(schema.transactions)
    .values({
      clientId: payload.clientId,
      type: payload.type,
      currency: payload.currency,
      amountCents: payload.amountCents,
      carpetId: payload.carpetId ?? null,
      materialLineId: payload.materialLineId ?? null,
      invoiceId: payload.invoiceId ?? null,
      transactionDate: payload.transactionDate,
      createdAt: payload.createdAt ?? Date.now(),
      reversesTransactionId: payload.reversesTransactionId ?? null,
      note: payload.note ?? null
    })
    .run()
  return Number(res.lastInsertRowid)
}

/** All transactions for a client (for balance computation). */
export function getClientTransactions(db: DB, clientId: number): schema.TransactionRow[] {
  return db.select().from(schema.transactions).where(eq(schema.transactions.clientId, clientId)).all()
}

/** A client's per-currency balances (positive => they owe us). */
export function getClientBalances(db: DB, clientId: number): PerCurrency {
  return clientBalances(getClientTransactions(db, clientId))
}

/**
 * Reverse a posted transaction by inserting a reversal row (never edits/deletes
 * the original — enforced both here and by the DB triggers). Returns the new
 * reversal transaction id.
 */
export function reverseTransaction(db: DB, transactionId: number): number {
  const original = db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, transactionId))
    .get()
  if (!original) {
    throw new Error(`Cannot reverse: transaction #${transactionId} not found`)
  }
  if (original.type === 'reversal') {
    throw new Error(`Cannot reverse a reversal (#${transactionId})`)
  }
  // Auto-note in Dari (single Afghan trader; see CLAUDE.md §6). Derive it from
  // the original note so the reversal describes the item it undoes, e.g.
  // "واپسی فروش قالین نمبر 0001" or "واپسی خرید ۵ کیلو نخ پشمی".
  const note = original.note ? `واپسی ${original.note}` : `واپسی تراکنش #${original.id}`
  const reversal = buildReversal({ ...original, id: original.id } as LedgerTransaction & { id: number }, { note })
  return postTransaction(db, reversal)
}
