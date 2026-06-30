import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import {
  clientBalances,
  buildReversal,
  carpetProfitCents,
  materialLineProfitCents,
  weightedAverageBuyPricePerKgCents,
  periodProfit,
  type LedgerTransaction,
  type PerCurrency,
  type Currency,
  type MaterialLineLike,
  type DevReport
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
  // "واپسی فروش قالین نمبر C-001" or "واپسی خرید ۵ کیلو تار سفید".
  const note = original.note ? `واپسی ${original.note}` : `واپسی تراکنش #${original.id}`
  const reversal = buildReversal({ ...original, id: original.id } as LedgerTransaction & { id: number }, { note })
  return postTransaction(db, reversal)
}

// ----------------------------------------------------------------------------
// TEMPORARY dev helper — seeds sample data and returns computed numbers so the
// figures can be checked by hand. Remove after Phase 1 verification.
// ----------------------------------------------------------------------------

/** Drop every table, recreate the schema, and re-seed reference data. */
function resetAllTables(
  rawExec: (sql: string) => void,
  reapply: () => void
): void {
  // DROP (not DELETE) so the immutability triggers on `transactions` don't fire.
  rawExec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS material_lines;
    DROP TABLE IF EXISTS expenses;
    DROP TABLE IF EXISTS carpets;
    DROP TABLE IF EXISTS transactions;
    DROP TABLE IF EXISTS materials;
    DROP TABLE IF EXISTS carpet_statuses;
    DROP TABLE IF EXISTS clients;
    PRAGMA foreign_keys = ON;
  `)
  reapply()
}

/**
 * Seed a small, hand-verifiable data set and compute balances/profit.
 * `rawExec` runs raw SQL (for the reset), `reapply` re-runs the migrations.
 */
export function devResetSeedCompute(
  db: DB,
  rawExec: (sql: string) => void,
  reapply: () => void
): DevReport {
  resetAllTables(rawExec, reapply)

  const now = Date.now()

  // --- Clients -------------------------------------------------------------
  const ahmad = Number(
    db.insert(schema.clients).values({ name: 'Ahmad (supplier)', createdAt: now }).run().lastInsertRowid
  )
  const karim = Number(
    db.insert(schema.clients).values({ name: 'Karim (buyer)', createdAt: now }).run().lastInsertRowid
  )

  // --- Carpet C1 (AFN): buy 6000.00 from Ahmad, sell 9000.00 to Karim ------
  const c1Area = 6
  const c1BuyPpm = 100000 // 1000.00/m
  const c1BuyTotal = (c1BuyPpm - 0) * c1Area // 600000
  const c1 = Number(
    db
      .insert(schema.carpets)
      .values({
        labelNumber: 'C-001',
        length: 2,
        width: 3,
        area: c1Area,
        sortGrade: 'A',
        pricePerMeterCents: c1BuyPpm,
        sortDeductionCents: 0,
        currency: 'AFN',
        totalPriceCents: c1BuyTotal,
        status: 'in_warehouse',
        boughtFromClientId: ahmad,
        createdAt: now
      })
      .run().lastInsertRowid
  )
  const c1BuyTx = postTransaction(db, {
    clientId: ahmad,
    type: 'purchase',
    currency: 'AFN',
    amountCents: -c1BuyTotal, // we owe Ahmad
    carpetId: c1,
    transactionDate: now,
    note: 'Bought carpet C-001'
  })
  const c1SellPpm = 150000 // 1500.00/m
  const c1SellTotal = (c1SellPpm - 0) * c1Area // 900000
  const c1SellTx = postTransaction(db, {
    clientId: karim,
    type: 'sale',
    currency: 'AFN',
    amountCents: c1SellTotal, // Karim owes us
    carpetId: c1,
    transactionDate: now,
    note: 'Sold carpet C-001'
  })
  db.update(schema.carpets)
    .set({
      buyTransactionId: c1BuyTx,
      status: 'sold',
      sellPricePerMeterCents: c1SellPpm,
      sellSortDeductionCents: 0,
      sellTotalPriceCents: c1SellTotal,
      soldToClientId: karim,
      sellTransactionId: c1SellTx,
      soldAt: now
    })
    .where(eq(schema.carpets.id, c1))
    .run()

  // --- Carpet C2 (USD): buy 200.00 from Ahmad, sell 320.00 to Karim --------
  const c2Area = 4
  const c2BuyPpm = 5000 // 50.00/m
  const c2BuyTotal = c2BuyPpm * c2Area // 20000
  const c2 = Number(
    db
      .insert(schema.carpets)
      .values({
        labelNumber: 'C-002',
        length: 2,
        width: 2,
        area: c2Area,
        sortGrade: 'B',
        pricePerMeterCents: c2BuyPpm,
        sortDeductionCents: 0,
        currency: 'USD',
        totalPriceCents: c2BuyTotal,
        status: 'in_warehouse',
        boughtFromClientId: ahmad,
        createdAt: now
      })
      .run().lastInsertRowid
  )
  const c2BuyTx = postTransaction(db, {
    clientId: ahmad,
    type: 'purchase',
    currency: 'USD',
    amountCents: -c2BuyTotal,
    carpetId: c2,
    transactionDate: now,
    note: 'Bought carpet C-002'
  })
  const c2SellPpm = 8000 // 80.00/m
  const c2SellTotal = c2SellPpm * c2Area // 32000
  const c2SellTx = postTransaction(db, {
    clientId: karim,
    type: 'sale',
    currency: 'USD',
    amountCents: c2SellTotal,
    carpetId: c2,
    transactionDate: now,
    note: 'Sold carpet C-002'
  })
  db.update(schema.carpets)
    .set({
      buyTransactionId: c2BuyTx,
      status: 'sold',
      sellPricePerMeterCents: c2SellPpm,
      sellSortDeductionCents: 0,
      sellTotalPriceCents: c2SellTotal,
      soldToClientId: karim,
      sellTransactionId: c2SellTx,
      soldAt: now
    })
    .where(eq(schema.carpets.id, c2))
    .run()

  // --- Material M1 (AFN): buy 10kg @ 50.00 from Ahmad; sell 4kg @ 80.00 ----
  const m1 = Number(
    db.insert(schema.materials).values({ name: 'Wool thread (tar)', currency: 'AFN', createdAt: now }).run()
      .lastInsertRowid
  )
  const m1BuyTotal = 5000 * 10 // 500.00 -> 50000
  const m1BuyLine = Number(
    db
      .insert(schema.materialLines)
      .values({
        materialId: m1,
        direction: 'buy',
        clientId: ahmad,
        kilograms: 10,
        pricePerKgCents: 5000,
        totalCents: m1BuyTotal,
        currency: 'AFN',
        transactionDate: now,
        createdAt: now
      })
      .run().lastInsertRowid
  )
  const m1BuyTx = postTransaction(db, {
    clientId: ahmad,
    type: 'purchase',
    currency: 'AFN',
    amountCents: -m1BuyTotal,
    materialLineId: m1BuyLine,
    transactionDate: now,
    note: 'Bought 10kg tar'
  })
  db.update(schema.materialLines).set({ transactionId: m1BuyTx }).where(eq(schema.materialLines.id, m1BuyLine)).run()

  const m1SellTotal = 8000 * 4 // 320.00 -> 32000
  const m1SellLine = Number(
    db
      .insert(schema.materialLines)
      .values({
        materialId: m1,
        direction: 'sell',
        clientId: karim,
        kilograms: 4,
        pricePerKgCents: 8000,
        totalCents: m1SellTotal,
        currency: 'AFN',
        transactionDate: now,
        createdAt: now
      })
      .run().lastInsertRowid
  )
  const m1SellTx = postTransaction(db, {
    clientId: karim,
    type: 'sale',
    currency: 'AFN',
    amountCents: m1SellTotal,
    materialLineId: m1SellLine,
    transactionDate: now,
    note: 'Sold 4kg tar'
  })
  db.update(schema.materialLines).set({ transactionId: m1SellTx }).where(eq(schema.materialLines.id, m1SellLine)).run()

  // --- Payments ------------------------------------------------------------
  // Karim pays us 4000.00 AFN (reduces receivable).
  postTransaction(db, {
    clientId: karim,
    type: 'payment',
    currency: 'AFN',
    amountCents: -400000,
    transactionDate: now,
    note: 'Karim paid 4000.00 AFN'
  })
  // We pay Ahmad 2000.00 AFN (reduces payable).
  postTransaction(db, {
    clientId: ahmad,
    type: 'payment',
    currency: 'AFN',
    amountCents: 200000,
    transactionDate: now,
    note: 'Paid Ahmad 2000.00 AFN'
  })

  // --- Expense -------------------------------------------------------------
  db.insert(schema.expenses)
    .values({ category: 'rent', amountCents: 30000, currency: 'AFN', expenseDate: now, createdAt: now, note: 'Shop rent' })
    .run()

  // ========================= COMPUTE (via pure engine) =====================
  const clientRows = db.select().from(schema.clients).all()
  const clients = clientRows.map((c) => ({
    id: c.id,
    name: c.name,
    balances: getClientBalances(db, c.id)
  }))

  const carpetRows = db.select().from(schema.carpets).all()
  const carpets = carpetRows.map((cp) => {
    const valuation = {
      area: cp.area,
      currency: cp.currency,
      buyPricePerMeterCents: cp.pricePerMeterCents,
      buyDeductionCents: cp.sortDeductionCents,
      sellPricePerMeterCents: cp.sellPricePerMeterCents,
      sellDeductionCents: cp.sellSortDeductionCents
    }
    return {
      id: cp.id,
      label: cp.labelNumber,
      currency: cp.currency,
      status: cp.status,
      buyTotalCents: cp.totalPriceCents,
      sellTotalCents: cp.sellTotalPriceCents,
      profitCents: carpetProfitCents(valuation)
    }
  })

  const materialRows = db.select().from(schema.materials).all()
  const allLines = db.select().from(schema.materialLines).all()
  const materials = materialRows.map((m) => {
    const lines: MaterialLineLike[] = allLines
      .filter((l) => l.materialId === m.id)
      .map((l) => ({
        direction: l.direction,
        currency: l.currency,
        kilograms: l.kilograms,
        pricePerKgCents: l.pricePerKgCents
      }))
    const buys = lines.filter((l) => l.direction === 'buy')
    const sells = lines.filter((l) => l.direction === 'sell')
    const avgBuy = weightedAverageBuyPricePerKgCents(buys)
    return {
      id: m.id,
      name: m.name,
      currency: m.currency,
      boughtKg: buys.reduce((s, l) => s + l.kilograms, 0),
      soldKg: sells.reduce((s, l) => s + l.kilograms, 0),
      avgBuyPerKgCents: avgBuy,
      profitCents: sells.reduce((s, l) => s + materialLineProfitCents(l, avgBuy), 0)
    }
  })

  // Period inputs (all time): per-currency profit + expense entries.
  const carpetProfitEntries = carpetRows
    .filter((cp) => cp.sellTotalPriceCents != null && cp.soldAt != null)
    .map((cp) => ({
      currency: cp.currency,
      profitCents:
        carpetProfitCents({
          area: cp.area,
          currency: cp.currency,
          buyPricePerMeterCents: cp.pricePerMeterCents,
          buyDeductionCents: cp.sortDeductionCents,
          sellPricePerMeterCents: cp.sellPricePerMeterCents,
          sellDeductionCents: cp.sellSortDeductionCents
        }) ?? 0,
      date: cp.soldAt as number
    }))

  // Material profit entries, one per sell line, costed at its lot's avg buy price.
  const avgBuyByMaterial = new Map<number, number>()
  for (const m of materialRows) {
    const buys: MaterialLineLike[] = allLines
      .filter((l) => l.materialId === m.id && l.direction === 'buy')
      .map((l) => ({ direction: l.direction, currency: l.currency, kilograms: l.kilograms, pricePerKgCents: l.pricePerKgCents }))
    avgBuyByMaterial.set(m.id, weightedAverageBuyPricePerKgCents(buys))
  }
  const materialProfitEntries = allLines
    .filter((l) => l.direction === 'sell')
    .map((l) => ({
      currency: l.currency,
      profitCents: materialLineProfitCents(
        { direction: l.direction, currency: l.currency, kilograms: l.kilograms, pricePerKgCents: l.pricePerKgCents },
        avgBuyByMaterial.get(l.materialId) ?? 0
      ),
      date: l.transactionDate
    }))

  const expenseRows = db.select().from(schema.expenses).all()
  const expenseEntries = expenseRows.map((e) => ({
    currency: e.currency,
    amountCents: e.amountCents,
    date: e.expenseDate
  }))

  const periodArgs = (currency: Currency): ReturnType<typeof periodProfit> =>
    periodProfit({
      carpetProfits: carpetProfitEntries,
      materialProfits: materialProfitEntries,
      expenses: expenseEntries,
      fromDate: 0,
      toDate: now,
      currency
    })

  const transactionsCount = db.select().from(schema.transactions).all().length

  return {
    generatedAt: now,
    clients,
    carpets,
    materials,
    period: { AFN: periodArgs('AFN'), USD: periodArgs('USD') },
    transactionsCount
  }
}
