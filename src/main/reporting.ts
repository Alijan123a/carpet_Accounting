import { eq, and, gte, lte, isNotNull, sql, type SQL } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './db/schema'
import {
  periodProfit,
  carpetProfitCents,
  weightedAverageBuyPricePerKgCents,
  materialLineProfitCents,
  type Currency,
  type PerCurrency,
  type PeriodProfitResult,
  type MaterialLineLike,
  type ProfitEntry,
  type ExpenseEntry
} from '../shared/accounting'

export type DB = BetterSQLite3Database<typeof schema>

const zero = (): PerCurrency => ({ AFN: 0, USD: 0 })
export const rangeStart = (from?: number | null): number => from ?? 0
export const rangeEnd = (to?: number | null): number => to ?? Number.MAX_SAFE_INTEGER

/** Per-client balances (SUM of signed amounts), one grouped query. */
export function clientBalanceMap(db: DB): Map<number, PerCurrency> {
  const rows = db
    .select({
      clientId: schema.transactions.clientId,
      currency: schema.transactions.currency,
      sum: sql<number>`COALESCE(SUM(${schema.transactions.amountCents}), 0)`
    })
    .from(schema.transactions)
    .groupBy(schema.transactions.clientId, schema.transactions.currency)
    .all()
  const map = new Map<number, PerCurrency>()
  for (const r of rows) {
    const b = map.get(r.clientId) ?? zero()
    b[r.currency as Currency] = Number(r.sum)
    map.set(r.clientId, b)
  }
  return map
}

/** Total receivables/payables per currency, plus per-client balances + names. */
export function receivablesPayables(db: DB): {
  receivables: PerCurrency
  payables: PerCurrency
  perClient: { id: number; name: string; AFN: number; USD: number }[]
} {
  const map = clientBalanceMap(db)
  const clients = db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).all()
  const receivables = zero()
  const payables = zero()
  const perClient = clients.map((c) => {
    const b = map.get(c.id) ?? zero()
    for (const cur of ['AFN', 'USD'] as Currency[]) {
      if (b[cur] > 0) receivables[cur] += b[cur]
      else if (b[cur] < 0) payables[cur] += -b[cur]
    }
    return { id: c.id, name: c.name, AFN: b.AFN, USD: b.USD }
  })
  return { receivables, payables, perClient }
}

/** Weighted-average buy price/kg per material lot (cost basis for sells). */
export function avgBuyByMaterial(db: DB): Map<number, number> {
  const buys = db
    .select()
    .from(schema.materialLines)
    .where(eq(schema.materialLines.direction, 'buy'))
    .all()
  const byMaterial = new Map<number, MaterialLineLike[]>()
  for (const l of buys) {
    const arr = byMaterial.get(l.materialId) ?? []
    arr.push({ direction: 'buy', currency: l.currency, kilograms: l.kilograms, pricePerKgCents: l.pricePerKgCents })
    byMaterial.set(l.materialId, arr)
  }
  const out = new Map<number, number>()
  for (const [id, lines] of byMaterial) out.set(id, weightedAverageBuyPricePerKgCents(lines))
  return out
}

export function carpetProfitEntries(db: DB, from?: number | null, to?: number | null): ProfitEntry[] {
  const conds: SQL[] = [isNotNull(schema.carpets.soldAt)]
  if (from != null) conds.push(gte(schema.carpets.soldAt, from))
  if (to != null) conds.push(lte(schema.carpets.soldAt, to))
  const rows = db.select().from(schema.carpets).where(and(...conds)).all()
  return rows.map((c) => ({
    currency: c.currency,
    profitCents:
      carpetProfitCents({
        area: c.area,
        currency: c.currency,
        buyPricePerMeterCents: c.pricePerMeterCents,
        buyDeductionCents: c.sortDeductionCents,
        sellPricePerMeterCents: c.sellPricePerMeterCents,
        sellDeductionCents: c.sellSortDeductionCents
      }) ?? 0,
    date: c.soldAt as number
  }))
}

export function materialProfitEntries(db: DB, from?: number | null, to?: number | null): ProfitEntry[] {
  const avg = avgBuyByMaterial(db)
  const conds: SQL[] = [eq(schema.materialLines.direction, 'sell')]
  if (from != null) conds.push(gte(schema.materialLines.transactionDate, from))
  if (to != null) conds.push(lte(schema.materialLines.transactionDate, to))
  const rows = db.select().from(schema.materialLines).where(and(...conds)).all()
  return rows.map((l) => ({
    currency: l.currency,
    profitCents: materialLineProfitCents(
      { direction: 'sell', currency: l.currency, kilograms: l.kilograms, pricePerKgCents: l.pricePerKgCents },
      avg.get(l.materialId) ?? 0
    ),
    date: l.transactionDate
  }))
}

export function expenseEntries(db: DB, from?: number | null, to?: number | null): ExpenseEntry[] {
  const conds: SQL[] = []
  if (from != null) conds.push(gte(schema.expenses.expenseDate, from))
  if (to != null) conds.push(lte(schema.expenses.expenseDate, to))
  const rows = db.select().from(schema.expenses).where(conds.length ? and(...conds) : undefined).all()
  return rows.map((e) => ({ currency: e.currency, amountCents: e.amountCents, date: e.expenseDate }))
}

/** Net period profit per currency (gross − expenses), reusing the pure engine. */
export function computePeriodProfit(
  db: DB,
  from?: number | null,
  to?: number | null
): { AFN: PeriodProfitResult; USD: PeriodProfitResult } {
  const fromDate = rangeStart(from)
  const toDate = rangeEnd(to)
  const carpets = carpetProfitEntries(db, fromDate, toDate)
  const materials = materialProfitEntries(db, fromDate, toDate)
  const expenses = expenseEntries(db, fromDate, toDate)
  const args = { carpetProfits: carpets, materialProfits: materials, expenses, fromDate, toDate }
  return {
    AFN: periodProfit({ ...args, currency: 'AFN' }),
    USD: periodProfit({ ...args, currency: 'USD' })
  }
}
