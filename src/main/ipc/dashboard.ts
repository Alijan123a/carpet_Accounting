import { ipcMain } from 'electron'
import { and, eq, gte, lte, isNull, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { receivablesPayables, computePeriodProfit } from '../reporting'
import type { Currency } from '../../shared/accounting'
import type { DashboardSummary, TurnoverPoint } from '../../shared/contracts'

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

export function registerDashboardIpc(getDb: () => DB): void {
  ipcMain.handle('dashboard:summary', (_e, params: { fromDate: number; toDate: number }) =>
    dashboardSummary(getDb(), params.fromDate, params.toDate)
  )
}
