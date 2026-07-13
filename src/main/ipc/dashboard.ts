import { ipcMain } from 'electron'
import { and, eq, gte, lte, isNull, isNotNull, asc, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { receivablesPayables, computePeriodProfit, avgBuyByMaterial } from '../reporting'
import { carpetRowProfitCents, materialLineProfitCents, type Currency } from '../../shared/accounting'
import type {
  DashboardSummary,
  TurnoverPoint,
  ClientBalanceRow,
  DashboardProfitDetail,
  DashboardStockDetail
} from '../../shared/contracts'

type DB = BetterSQLite3Database<typeof schema>

export function dashboardSummary(db: DB, fromDate: number, toDate: number): DashboardSummary {
  const rp = receivablesPayables(db)

  // Carpets currently in warehouse: not sold and not archived.
  const wh = db
    .select({ c: sql<number>`COUNT(*)` })
    .from(schema.carpets)
    .where(and(isNull(schema.carpets.sellTransactionId), eq(schema.carpets.archived, false)))
    .get()

  // Material stock on hand (kg): bought − sold across non-archived lots.
  const stock = db
    .select({
      kg: sql<number>`COALESCE(SUM(CASE WHEN ${schema.materialLines.direction} = 'buy' THEN ${schema.materialLines.kilograms} ELSE -${schema.materialLines.kilograms} END), 0)`
    })
    .from(schema.materialLines)
    .innerJoin(schema.materials, eq(schema.materialLines.materialId, schema.materials.id))
    .where(eq(schema.materials.archived, false))
    .get()

  // Monthly turnover (sum of sales) per currency within the range.
  const turnoverRows = db
    .select({
      ym: sql<string>`strftime('%Y-%m', ${schema.transactions.transactionDate} / 1000, 'unixepoch')`,
      currency: schema.transactions.currency,
      total: sql<number>`COALESCE(SUM(${schema.transactions.amountCents}), 0)`
    })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.type, 'sale'),
        gte(schema.transactions.transactionDate, fromDate),
        lte(schema.transactions.transactionDate, toDate)
      )
    )
    .groupBy(
      sql`strftime('%Y-%m', ${schema.transactions.transactionDate} / 1000, 'unixepoch')`,
      schema.transactions.currency
    )
    .all()

  const byMonth = new Map<string, TurnoverPoint>()
  for (const r of turnoverRows) {
    const p = byMonth.get(r.ym) ?? { period: r.ym, afn: 0, usd: 0 }
    if ((r.currency as Currency) === 'AFN') p.afn = Number(r.total)
    else p.usd = Number(r.total)
    byMonth.set(r.ym, p)
  }
  const turnover = [...byMonth.values()].sort((a, b) => a.period.localeCompare(b.period))

  return {
    receivables: rp.receivables,
    payables: rp.payables,
    warehouseCount: Number(wh?.c ?? 0),
    materialStockKg: Number(stock?.kg ?? 0),
    periodProfit: computePeriodProfit(db, fromDate, toDate),
    turnover
  }
}

/** Per-client signed balances for the receivables/payables popups. */
export function dashboardBalancesByClient(db: DB): ClientBalanceRow[] {
  return receivablesPayables(db).perClient.filter((c) => c.AFN !== 0 || c.USD !== 0)
}

/**
 * Breakdown of the period's net profit: every sold carpet (stored-totals
 * profit, same helper as everywhere else), every material sell line, and every
 * expense in the range. AFN and USD entries are kept apart by their currency —
 * the popup groups them, never sums across currencies.
 */
export function dashboardProfitDetail(db: DB, fromDate: number, toDate: number): DashboardProfitDetail {
  const buyer = alias(schema.clients, 'buyer')
  const carpetRows = db
    .select({ carpet: schema.carpets, buyerName: buyer.name })
    .from(schema.carpets)
    .leftJoin(buyer, eq(schema.carpets.soldToClientId, buyer.id))
    .where(and(isNotNull(schema.carpets.soldAt), gte(schema.carpets.soldAt, fromDate), lte(schema.carpets.soldAt, toDate)))
    .orderBy(asc(schema.carpets.soldAt))
    .all()

  const avg = avgBuyByMaterial(db)
  const mlBuyer = alias(schema.clients, 'ml_buyer')
  const materialRows = db
    .select({ line: schema.materialLines, name: schema.materials.name, buyerName: mlBuyer.name })
    .from(schema.materialLines)
    .leftJoin(schema.materials, eq(schema.materialLines.materialId, schema.materials.id))
    .leftJoin(mlBuyer, eq(schema.materialLines.clientId, mlBuyer.id))
    .where(
      and(
        eq(schema.materialLines.direction, 'sell'),
        gte(schema.materialLines.transactionDate, fromDate),
        lte(schema.materialLines.transactionDate, toDate)
      )
    )
    .orderBy(asc(schema.materialLines.transactionDate))
    .all()

  const expenseRows = db
    .select()
    .from(schema.expenses)
    .where(and(gte(schema.expenses.expenseDate, fromDate), lte(schema.expenses.expenseDate, toDate)))
    .orderBy(asc(schema.expenses.expenseDate))
    .all()

  return {
    carpets: carpetRows.map(({ carpet: c, buyerName }) => ({
      id: c.id,
      label: c.labelNumber,
      date: c.soldAt as number,
      buyerName,
      currency: c.currency,
      buyTotalCents: c.totalPriceCents,
      sellTotalCents: c.sellTotalPriceCents ?? 0,
      profitCents: carpetRowProfitCents(c) ?? 0
    })),
    materials: materialRows.map(({ line: l, name, buyerName }) => ({
      id: l.id,
      name: name ?? '',
      date: l.transactionDate,
      buyerName,
      currency: l.currency,
      kilograms: l.kilograms,
      profitCents: materialLineProfitCents(
        { direction: 'sell', currency: l.currency, kilograms: l.kilograms, pricePerKgCents: l.pricePerKgCents },
        avg.get(l.materialId) ?? 0
      )
    })),
    expenses: expenseRows.map((e) => ({
      id: e.id,
      category: e.category,
      date: e.expenseDate,
      currency: e.currency,
      amountCents: e.amountCents
    }))
  }
}

/** In-warehouse carpets + per-material stock (dashboard stock popups). */
export function dashboardStockDetail(db: DB): DashboardStockDetail {
  const carpetRows = db
    .select()
    .from(schema.carpets)
    .where(and(isNull(schema.carpets.sellTransactionId), eq(schema.carpets.archived, false)))
    .orderBy(asc(schema.carpets.labelNumber))
    .all()

  const matRows = db
    .select({
      id: schema.materials.id,
      name: schema.materials.name,
      currency: schema.materials.currency,
      stock: sql<number>`COALESCE(SUM(CASE WHEN ${schema.materialLines.direction}='buy' THEN ${schema.materialLines.kilograms} ELSE -${schema.materialLines.kilograms} END),0)`
    })
    .from(schema.materials)
    .leftJoin(schema.materialLines, eq(schema.materialLines.materialId, schema.materials.id))
    .where(eq(schema.materials.archived, false))
    .groupBy(schema.materials.id)
    .orderBy(asc(schema.materials.name))
    .all()

  return {
    carpets: carpetRows.map((c) => ({
      id: c.id,
      label: c.labelNumber,
      area: c.area,
      sortGrade: c.sortGrade,
      currency: c.currency,
      totalPriceCents: c.totalPriceCents
    })),
    materials: matRows.map((m) => ({ id: m.id, name: m.name, currency: m.currency, stockKg: Number(m.stock) }))
  }
}

export function registerDashboardIpc(getDb: () => DB): void {
  ipcMain.handle('dashboard:summary', (_e, params: { fromDate: number; toDate: number }) =>
    dashboardSummary(getDb(), params.fromDate, params.toDate)
  )
  ipcMain.handle('dashboard:balancesByClient', () => dashboardBalancesByClient(getDb()))
  ipcMain.handle('dashboard:profitDetail', (_e, params: { fromDate: number; toDate: number }) =>
    dashboardProfitDetail(getDb(), params.fromDate, params.toDate)
  )
  ipcMain.handle('dashboard:stockDetail', () => dashboardStockDetail(getDb()))
}
