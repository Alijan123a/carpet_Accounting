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
  // "واپسی فروش قالین نمبر 0001" or "واپسی خرید ۵ کیلو نخ پشمی".
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
  const DAY = 86_400_000
  /** A business date `d` days before "now" (older data spread across months). */
  const at = (d: number): number => now - d * DAY

  // --- Clients -------------------------------------------------------------
  // A realistic mix of suppliers and buyers; several act as both across deals.
  const clientNames = [
    'Ahmad Wali', // 0  supplier
    'Ghulam Sakhi', // 1  supplier
    'Rahim Gul', // 2  supplier + buyer
    'Naseer Ahmad', // 3  supplier
    'Karim Khan', // 4  buyer
    'Yusuf Ali', // 5  buyer
    'Fahim Nazari', // 6  buyer
    'Zahra Carpets' // 7  buyer + supplier
  ]
  const clientIds = clientNames.map((name, i) =>
    Number(db.insert(schema.clients).values({ name, createdAt: at(120 - i) }).run().lastInsertRowid)
  )

  // --- Carpets -------------------------------------------------------------
  // 4-digit label numbers (per spec). Each carpet is bought whole from a
  // supplier and most are later sold whole to one buyer. Money is integer cents;
  // `ppm`/`ded` are price-per-meter and sort-deduction per meter.
  interface Sale {
    buyer: number
    ppm: number
    ded: number
    soldDaysAgo: number
  }
  interface CarpetDef {
    label: string
    l: number
    w: number
    grade: string
    currency: Currency
    seller: number
    ppm: number
    ded: number
    boughtDaysAgo: number
    sale?: Sale
  }
  const carpetDefs: CarpetDef[] = [
    { label: '0001', l: 2, w: 3, grade: 'A', currency: 'AFN', seller: 0, ppm: 120000, ded: 0, boughtDaysAgo: 110, sale: { buyer: 4, ppm: 175000, ded: 0, soldDaysAgo: 95 } },
    { label: '0002', l: 2.5, w: 3.5, grade: 'A', currency: 'AFN', seller: 0, ppm: 110000, ded: 5000, boughtDaysAgo: 108, sale: { buyer: 5, ppm: 160000, ded: 0, soldDaysAgo: 88 } },
    { label: '0003', l: 2, w: 2, grade: 'B', currency: 'USD', seller: 1, ppm: 5000, ded: 0, boughtDaysAgo: 100, sale: { buyer: 4, ppm: 8000, ded: 0, soldDaysAgo: 84 } },
    { label: '0004', l: 3, w: 4, grade: 'A', currency: 'AFN', seller: 1, ppm: 130000, ded: 0, boughtDaysAgo: 96, sale: { buyer: 6, ppm: 190000, ded: 0, soldDaysAgo: 70 } },
    { label: '0005', l: 2, w: 3, grade: 'B', currency: 'AFN', seller: 2, ppm: 90000, ded: 0, boughtDaysAgo: 90 },
    { label: '0006', l: 1.5, w: 2, grade: 'C', currency: 'USD', seller: 3, ppm: 4000, ded: 0, boughtDaysAgo: 85, sale: { buyer: 5, ppm: 7000, ded: 0, soldDaysAgo: 60 } },
    { label: '0007', l: 2, w: 3.5, grade: 'A', currency: 'AFN', seller: 0, ppm: 125000, ded: 0, boughtDaysAgo: 80, sale: { buyer: 7, ppm: 180000, ded: 0, soldDaysAgo: 55 } },
    { label: '0008', l: 3, w: 5, grade: 'A', currency: 'AFN', seller: 2, ppm: 140000, ded: 10000, boughtDaysAgo: 76, sale: { buyer: 4, ppm: 200000, ded: 0, soldDaysAgo: 40 } },
    { label: '0009', l: 2, w: 3, grade: 'B', currency: 'USD', seller: 3, ppm: 6000, ded: 0, boughtDaysAgo: 70 },
    { label: '0010', l: 2, w: 2.5, grade: 'B', currency: 'AFN', seller: 1, ppm: 100000, ded: 0, boughtDaysAgo: 64, sale: { buyer: 6, ppm: 150000, ded: 0, soldDaysAgo: 35 } },
    { label: '0011', l: 2.5, w: 4, grade: 'A', currency: 'AFN', seller: 0, ppm: 135000, ded: 0, boughtDaysAgo: 58, sale: { buyer: 5, ppm: 195000, ded: 5000, soldDaysAgo: 28 } },
    { label: '0012', l: 2, w: 2, grade: 'C', currency: 'USD', seller: 7, ppm: 4500, ded: 0, boughtDaysAgo: 50 },
    { label: '0013', l: 3, w: 4, grade: 'A', currency: 'AFN', seller: 2, ppm: 128000, ded: 0, boughtDaysAgo: 44, sale: { buyer: 7, ppm: 185000, ded: 0, soldDaysAgo: 18 } },
    { label: '0014', l: 2, w: 3, grade: 'B', currency: 'AFN', seller: 3, ppm: 95000, ded: 0, boughtDaysAgo: 30 }
  ]

  for (const d of carpetDefs) {
    const area = d.l * d.w
    const buyEffective = Math.max(0, d.ppm - d.ded)
    const buyTotal = Math.round(buyEffective * area)
    const carpetId = Number(
      db
        .insert(schema.carpets)
        .values({
          labelNumber: d.label,
          length: d.l,
          width: d.w,
          area,
          sortGrade: d.grade,
          pricePerMeterCents: d.ppm,
          sortDeductionCents: d.ded,
          currency: d.currency,
          totalPriceCents: buyTotal,
          status: d.sale ? 'sold' : 'in_warehouse',
          boughtFromClientId: clientIds[d.seller],
          createdAt: at(d.boughtDaysAgo)
        })
        .run().lastInsertRowid
    )
    const buyTx = postTransaction(db, {
      clientId: clientIds[d.seller],
      type: 'purchase',
      currency: d.currency,
      amountCents: -buyTotal, // we owe the supplier
      carpetId,
      transactionDate: at(d.boughtDaysAgo),
      note: `Bought carpet ${d.label}`
    })
    db.update(schema.carpets).set({ buyTransactionId: buyTx }).where(eq(schema.carpets.id, carpetId)).run()

    if (d.sale) {
      const s = d.sale
      const sellEffective = Math.max(0, s.ppm - s.ded)
      const sellTotal = Math.round(sellEffective * area)
      const sellTx = postTransaction(db, {
        clientId: clientIds[s.buyer],
        type: 'sale',
        currency: d.currency,
        amountCents: sellTotal, // the buyer owes us
        carpetId,
        transactionDate: at(s.soldDaysAgo),
        note: `Sold carpet ${d.label}`
      })
      db.update(schema.carpets)
        .set({
          status: 'sold',
          sellPricePerMeterCents: s.ppm,
          sellSortDeductionCents: s.ded,
          sellTotalPriceCents: sellTotal,
          soldToClientId: clientIds[s.buyer],
          sellTransactionId: sellTx,
          soldAt: at(s.soldDaysAgo)
        })
        .where(eq(schema.carpets.id, carpetId))
        .run()
    }
  }

  // --- Materials (thread) --------------------------------------------------
  // Two or three material types, each with several kg-based buy/sell lines.
  interface MatLine {
    client: number
    kg: number
    ppkg: number
    daysAgo: number
  }
  interface MatDef {
    name: string
    currency: Currency
    buys: MatLine[]
    sells: MatLine[]
  }
  const materialDefs: MatDef[] = [
    {
      name: 'Wool thread',
      currency: 'AFN',
      buys: [
        { client: 0, kg: 20, ppkg: 5000, daysAgo: 100 },
        { client: 1, kg: 15, ppkg: 5200, daysAgo: 80 },
        { client: 0, kg: 10, ppkg: 5100, daysAgo: 40 }
      ],
      sells: [
        { client: 4, kg: 12, ppkg: 8000, daysAgo: 70 },
        { client: 5, kg: 8, ppkg: 8200, daysAgo: 30 }
      ]
    },
    {
      name: 'Cotton thread',
      currency: 'AFN',
      buys: [
        { client: 2, kg: 30, ppkg: 3000, daysAgo: 90 },
        { client: 3, kg: 20, ppkg: 3100, daysAgo: 50 }
      ],
      sells: [
        { client: 6, kg: 15, ppkg: 4500, daysAgo: 60 },
        { client: 4, kg: 10, ppkg: 4600, daysAgo: 20 }
      ]
    },
    {
      name: 'Silk thread',
      currency: 'USD',
      buys: [
        { client: 1, kg: 5, ppkg: 12000, daysAgo: 85 },
        { client: 7, kg: 4, ppkg: 12500, daysAgo: 45 }
      ],
      sells: [
        { client: 5, kg: 3, ppkg: 18000, daysAgo: 55 },
        { client: 6, kg: 2, ppkg: 19000, daysAgo: 15 }
      ]
    }
  ]

  for (const m of materialDefs) {
    const materialId = Number(
      db.insert(schema.materials).values({ name: m.name, currency: m.currency, createdAt: at(105) }).run().lastInsertRowid
    )
    const postLine = (line: MatLine, direction: 'buy' | 'sell'): void => {
      const total = Math.round(line.kg * line.ppkg)
      const lineId = Number(
        db
          .insert(schema.materialLines)
          .values({
            materialId,
            direction,
            clientId: clientIds[line.client],
            kilograms: line.kg,
            pricePerKgCents: line.ppkg,
            totalCents: total,
            currency: m.currency,
            transactionDate: at(line.daysAgo),
            createdAt: at(line.daysAgo)
          })
          .run().lastInsertRowid
      )
      const tx = postTransaction(db, {
        clientId: clientIds[line.client],
        type: direction === 'buy' ? 'purchase' : 'sale',
        currency: m.currency,
        amountCents: direction === 'buy' ? -total : total,
        materialLineId: lineId,
        transactionDate: at(line.daysAgo),
        note: `${direction === 'buy' ? 'Bought' : 'Sold'} ${line.kg}kg ${m.name}`
      })
      db.update(schema.materialLines).set({ transactionId: tx }).where(eq(schema.materialLines.id, lineId)).run()
    }
    for (const b of m.buys) postLine(b, 'buy')
    for (const s of m.sells) postLine(s, 'sell')
  }

  // --- Payments (partial settlements; not counted as buy/sell) -------------
  const payments: { client: number; currency: Currency; amountCents: number; daysAgo: number; note: string }[] = [
    { client: 4, currency: 'AFN', amountCents: -500000, daysAgo: 50, note: 'Karim paid 5000.00 AFN' },
    { client: 5, currency: 'AFN', amountCents: -300000, daysAgo: 25, note: 'Yusuf paid 3000.00 AFN' },
    { client: 0, currency: 'AFN', amountCents: 400000, daysAgo: 60, note: 'Paid Ahmad 4000.00 AFN' },
    { client: 1, currency: 'AFN', amountCents: 800000, daysAgo: 35, note: 'Paid Ghulam 8000.00 AFN' },
    { client: 4, currency: 'USD', amountCents: -20000, daysAgo: 10, note: 'Karim paid 200.00 USD' }
  ]
  for (const p of payments) {
    postTransaction(db, {
      clientId: clientIds[p.client],
      type: 'payment',
      currency: p.currency,
      amountCents: p.amountCents,
      transactionDate: at(p.daysAgo),
      note: p.note
    })
  }

  // --- Expenses ------------------------------------------------------------
  const expenseDefs: { category: string; amountCents: number; currency: Currency; daysAgo: number; note: string }[] = [
    { category: 'rent', amountCents: 500000, currency: 'AFN', daysAgo: 90, note: 'Shop rent' },
    { category: 'rent', amountCents: 500000, currency: 'AFN', daysAgo: 30, note: 'Shop rent' },
    { category: 'transport', amountCents: 120000, currency: 'AFN', daysAgo: 65, note: 'Freight' },
    { category: 'wages', amountCents: 800000, currency: 'AFN', daysAgo: 45, note: 'Worker wages' },
    { category: 'packing', amountCents: 3000, currency: 'USD', daysAgo: 20, note: 'Packing materials' }
  ]
  for (const e of expenseDefs) {
    db.insert(schema.expenses)
      .values({ category: e.category, amountCents: e.amountCents, currency: e.currency, expenseDate: at(e.daysAgo), createdAt: at(e.daysAgo), note: e.note })
      .run()
  }

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
