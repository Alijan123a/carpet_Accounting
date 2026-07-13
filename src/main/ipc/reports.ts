import { ipcMain } from 'electron'
import { and, eq, gte, lte, asc, isNull, isNotNull, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { carpetRowProfitCents, materialLineProfitCents, ENABLED_CURRENCIES, type Currency } from '../../shared/accounting'
import type { ColumnKind, ReportColumn, ReportResult, ReportSection, ReportRow, ReportId, ReportParams } from '../../shared/reports'
import {
  receivablesPayables,
  avgBuyByMaterial,
  computePeriodProfit,
  rangeStart,
  rangeEnd
} from '../reporting'

type DB = BetterSQLite3Database<typeof schema>
// Report sections are emitted per enabled currency — AFN and USD totals are
// always computed and shown separately, never summed together.
const CURRENCIES: Currency[] = [...ENABLED_CURRENCIES]

function col(
  key: string,
  labelKey: string,
  defaultLabel: string,
  kind: ColumnKind = 'text',
  align: 'start' | 'end' = 'start'
): ReportColumn {
  return { key, labelKey, defaultLabel, kind, align }
}

// ---------- 1. Client statement (running balance per currency) -------------
function clientStatement(db: DB, p: ReportParams): ReportResult {
  const clientId = p.clientId ?? 0
  const client = db.select().from(schema.clients).where(eq(schema.clients.id, clientId)).get()
  const columns: ReportColumn[] = [
    col('date', 'statement.date', 'Date', 'date'),
    col('type', 'statement.type', 'Type', 'txtype'),
    col('amount', 'statement.amount', 'Amount', 'money', 'end'),
    col('running', 'reports.running', 'Running', 'money', 'end'),
    col('linked', 'statement.linked', 'Linked', 'text'),
    col('note', 'statement.note', 'Note', 'text')
  ]

  const sections: ReportSection[] = CURRENCIES.map((cur) => {
    // Opening balance = sum of amounts strictly before the range start.
    const from = p.fromDate ?? null
    let opening = 0
    if (from != null) {
      const o = db
        .select({ s: sql<number>`COALESCE(SUM(${schema.transactions.amountCents}),0)` })
        .from(schema.transactions)
        .where(
          and(
            eq(schema.transactions.clientId, clientId),
            eq(schema.transactions.currency, cur),
            sql`${schema.transactions.transactionDate} < ${from}`
          )
        )
        .get()
      opening = Number(o?.s ?? 0)
    }

    const conds: SQL[] = [eq(schema.transactions.clientId, clientId), eq(schema.transactions.currency, cur)]
    if (p.fromDate != null) conds.push(gte(schema.transactions.transactionDate, p.fromDate))
    if (p.toDate != null) conds.push(lte(schema.transactions.transactionDate, p.toDate))

    const rows = db
      .select({
        type: schema.transactions.type,
        amountCents: schema.transactions.amountCents,
        transactionDate: schema.transactions.transactionDate,
        createdAt: schema.transactions.createdAt,
        note: schema.transactions.note,
        carpetLabel: schema.carpets.labelNumber,
        materialName: schema.materials.name
      })
      .from(schema.transactions)
      .leftJoin(schema.carpets, eq(schema.transactions.carpetId, schema.carpets.id))
      .leftJoin(schema.materialLines, eq(schema.transactions.materialLineId, schema.materialLines.id))
      .leftJoin(schema.materials, eq(schema.materialLines.materialId, schema.materials.id))
      .where(and(...conds))
      .orderBy(asc(schema.transactions.transactionDate), asc(schema.transactions.createdAt), asc(schema.transactions.id))
      .all()

    let running = opening
    const reportRows: ReportRow[] = rows.map((r) => {
      running += r.amountCents
      return {
        date: r.transactionDate,
        type: r.type,
        amount: r.amountCents,
        running,
        linked: r.carpetLabel ? `#${r.carpetLabel}` : r.materialName ? r.materialName : null,
        note: r.note
      }
    })
    return {
      title: cur,
      columns,
      rows: reportRows,
      footer: { date: null, type: null, amount: null, running, linked: null, note: null }
    }
  })

  return {
    titleKey: 'reports.clientStatement',
    defaultTitle: `Statement — ${client?.name ?? ''}`,
    sections
  }
}

// ---------- 2. Warehouse (carpets in stock + material stock) ---------------
function warehouse(db: DB): ReportResult {
  const carpetRows = db
    .select()
    .from(schema.carpets)
    .where(and(isNull(schema.carpets.sellTransactionId), eq(schema.carpets.archived, false)))
    .orderBy(asc(schema.carpets.labelNumber))
    .all()

  const carpetsSection: ReportSection = {
    titleKey: 'reports.carpetsInStock',
    columns: [
      col('label', 'carpets.label', 'Label #', 'text'),
      col('area', 'carpets.area', 'Area', 'kg', 'end'),
      col('grade', 'carpets.sortGrade', 'Grade', 'text'),
      col('currency', 'carpets.currency', 'Cur', 'text'),
      col('total', 'carpets.totalPrice', 'Total', 'money', 'end')
    ],
    rows: carpetRows.map((c) => ({
      label: c.labelNumber,
      area: c.area,
      grade: c.sortGrade,
      currency: c.currency,
      total: c.totalPriceCents
    }))
  }

  const matRows = db
    .select({
      name: schema.materials.name,
      currency: schema.materials.currency,
      stock: sql<number>`COALESCE(SUM(CASE WHEN ${schema.materialLines.direction}='buy' THEN ${schema.materialLines.kilograms} ELSE -${schema.materialLines.kilograms} END),0)`
    })
    .from(schema.materials)
    .leftJoin(schema.materialLines, eq(schema.materialLines.materialId, schema.materials.id))
    .where(eq(schema.materials.archived, false))
    .groupBy(schema.materials.id)
    .all()

  const materialSection: ReportSection = {
    titleKey: 'reports.materialStock',
    columns: [
      col('name', 'material.name', 'Name', 'text'),
      col('currency', 'material.currency', 'Cur', 'text'),
      col('stock', 'material.stock', 'Stock (kg)', 'kg', 'end')
    ],
    rows: matRows.map((m) => ({ name: m.name, currency: m.currency, stock: Number(m.stock) }))
  }

  return { titleKey: 'reports.warehouse', defaultTitle: 'Warehouse', sections: [carpetsSection, materialSection] }
}

// ---------- 3. Periodic profit (per currency) ------------------------------
function periodicProfit(db: DB, p: ReportParams): ReportResult {
  const pp = computePeriodProfit(db, p.fromDate, p.toDate)
  const rows: ReportRow[] = CURRENCIES.map((cur) => ({
    currency: cur,
    gross: pp[cur].grossProfitCents,
    expenses: pp[cur].expensesCents,
    net: pp[cur].netProfitCents
  }))
  return {
    titleKey: 'reports.periodicProfit',
    defaultTitle: 'Periodic profit',
    sections: [
      {
        columns: [
          col('currency', 'carpets.currency', 'Currency', 'text'),
          col('gross', 'reports.gross', 'Gross', 'money', 'end'),
          col('expenses', 'reports.expenses', 'Expenses', 'money', 'end'),
          col('net', 'reports.net', 'Net', 'money', 'end')
        ],
        rows
      }
    ]
  }
}

// ---------- 4. Sold list (carpets + material) ------------------------------
function soldList(db: DB, p: ReportParams): ReportResult {
  const cConds: SQL[] = [isNotNull(schema.carpets.soldAt)]
  if (p.fromDate != null) cConds.push(gte(schema.carpets.soldAt, p.fromDate))
  if (p.toDate != null) cConds.push(lte(schema.carpets.soldAt, p.toDate))
  const buyer = alias(schema.clients, 'buyer')
  const carpetRows = db
    .select({ carpet: schema.carpets, buyerName: buyer.name })
    .from(schema.carpets)
    .leftJoin(buyer, eq(schema.carpets.soldToClientId, buyer.id))
    .where(and(...cConds))
    .orderBy(asc(schema.carpets.soldAt))
    .all()

  const carpetsSection: ReportSection = {
    titleKey: 'reports.soldCarpets',
    columns: [
      col('date', 'statement.date', 'Date', 'date'),
      col('label', 'carpets.label', 'Label #', 'text'),
      col('buyer', 'carpets.soldTo', 'Buyer', 'text'),
      col('currency', 'carpets.currency', 'Cur', 'text'),
      col('total', 'carpets.totalPrice', 'Sell total', 'money', 'end'),
      col('profit', 'carpets.profit', 'Profit', 'money', 'end')
    ],
    rows: carpetRows.map(({ carpet: c, buyerName }) => ({
      date: c.soldAt,
      label: c.labelNumber,
      buyer: buyerName,
      currency: c.currency,
      total: c.sellTotalPriceCents,
      // Stored-totals profit — matches the carpets list and the dashboard.
      profit: carpetRowProfitCents(c) ?? 0
    }))
  }

  const avg = avgBuyByMaterial(db)
  const mConds: SQL[] = [eq(schema.materialLines.direction, 'sell')]
  if (p.fromDate != null) mConds.push(gte(schema.materialLines.transactionDate, p.fromDate))
  if (p.toDate != null) mConds.push(lte(schema.materialLines.transactionDate, p.toDate))
  const mlBuyer = alias(schema.clients, 'ml_buyer')
  const matRows = db
    .select({ line: schema.materialLines, name: schema.materials.name, clientName: mlBuyer.name })
    .from(schema.materialLines)
    .leftJoin(schema.materials, eq(schema.materialLines.materialId, schema.materials.id))
    .leftJoin(mlBuyer, eq(schema.materialLines.clientId, mlBuyer.id))
    .where(and(...mConds))
    .orderBy(asc(schema.materialLines.transactionDate))
    .all()

  const materialSection: ReportSection = {
    titleKey: 'reports.soldMaterial',
    columns: [
      col('date', 'statement.date', 'Date', 'date'),
      col('name', 'material.name', 'Material', 'text'),
      col('buyer', 'carpets.soldTo', 'Buyer', 'text'),
      col('currency', 'material.currency', 'Cur', 'text'),
      col('kg', 'material.kilograms', 'kg', 'kg', 'end'),
      col('total', 'material.lineTotal', 'Total', 'money', 'end'),
      col('profit', 'material.lineProfit', 'Profit', 'money', 'end')
    ],
    rows: matRows.map(({ line: l, name, clientName }) => ({
      date: l.transactionDate,
      name,
      buyer: clientName,
      currency: l.currency,
      kg: l.kilograms,
      total: l.totalCents,
      profit: materialLineProfitCents(
        { direction: 'sell', currency: l.currency, kilograms: l.kilograms, pricePerKgCents: l.pricePerKgCents },
        avg.get(l.materialId) ?? 0
      )
    }))
  }

  return { titleKey: 'reports.soldList', defaultTitle: 'Sold list', sections: [carpetsSection, materialSection] }
}

// ---------- 5. Purchased list (carpets + material) -------------------------
function purchasedList(db: DB, p: ReportParams): ReportResult {
  // Filter/display carpets by the BUY transaction's business date (not the
  // record-creation timestamp) so it matches soldList + material lines.
  const buyTx = alias(schema.transactions, 'buy_tx')
  const cConds: SQL[] = [isNotNull(schema.carpets.boughtFromClientId)]
  if (p.fromDate != null) cConds.push(gte(buyTx.transactionDate, p.fromDate))
  if (p.toDate != null) cConds.push(lte(buyTx.transactionDate, p.toDate))
  const seller = alias(schema.clients, 'seller')
  const carpetRows = db
    .select({ carpet: schema.carpets, sellerName: seller.name, buyDate: buyTx.transactionDate })
    .from(schema.carpets)
    .leftJoin(seller, eq(schema.carpets.boughtFromClientId, seller.id))
    .leftJoin(buyTx, eq(schema.carpets.buyTransactionId, buyTx.id))
    .where(and(...cConds))
    .orderBy(asc(buyTx.transactionDate))
    .all()

  const carpetsSection: ReportSection = {
    titleKey: 'reports.purchasedCarpets',
    columns: [
      col('date', 'statement.date', 'Date', 'date'),
      col('label', 'carpets.label', 'Label #', 'text'),
      col('seller', 'carpets.boughtFrom', 'Seller', 'text'),
      col('currency', 'carpets.currency', 'Cur', 'text'),
      col('total', 'carpets.totalPrice', 'Buy total', 'money', 'end')
    ],
    rows: carpetRows.map(({ carpet: c, sellerName, buyDate }) => ({
      date: buyDate ?? c.createdAt,
      label: c.labelNumber,
      seller: sellerName,
      currency: c.currency,
      total: c.totalPriceCents
    }))
  }

  const mConds: SQL[] = [eq(schema.materialLines.direction, 'buy')]
  if (p.fromDate != null) mConds.push(gte(schema.materialLines.transactionDate, p.fromDate))
  if (p.toDate != null) mConds.push(lte(schema.materialLines.transactionDate, p.toDate))
  const mlSeller = alias(schema.clients, 'ml_seller')
  const matRows = db
    .select({ line: schema.materialLines, name: schema.materials.name, clientName: mlSeller.name })
    .from(schema.materialLines)
    .leftJoin(schema.materials, eq(schema.materialLines.materialId, schema.materials.id))
    .leftJoin(mlSeller, eq(schema.materialLines.clientId, mlSeller.id))
    .where(and(...mConds))
    .orderBy(asc(schema.materialLines.transactionDate))
    .all()

  const materialSection: ReportSection = {
    titleKey: 'reports.purchasedMaterial',
    columns: [
      col('date', 'statement.date', 'Date', 'date'),
      col('name', 'material.name', 'Material', 'text'),
      col('seller', 'carpets.boughtFrom', 'Seller', 'text'),
      col('currency', 'material.currency', 'Cur', 'text'),
      col('kg', 'material.kilograms', 'kg', 'kg', 'end'),
      col('total', 'material.lineTotal', 'Total', 'money', 'end')
    ],
    rows: matRows.map(({ line: l, name, clientName }) => ({
      date: l.transactionDate,
      name,
      seller: clientName,
      currency: l.currency,
      kg: l.kilograms,
      total: l.totalCents
    }))
  }

  return { titleKey: 'reports.purchasedList', defaultTitle: 'Purchased list', sections: [carpetsSection, materialSection] }
}

// ---------- 6. Receivables / payables --------------------------------------
function receivablesPayablesReport(db: DB): ReportResult {
  const rp = receivablesPayables(db)
  const byClient: ReportSection = {
    titleKey: 'reports.byClient',
    columns: [
      col('client', 'clients.title', 'Client', 'text'),
      col('usd', 'clients.balanceUSD', 'USD', 'money', 'end')
    ],
    rows: rp.perClient.filter((c) => c.USD !== 0).map((c) => ({ client: c.name, usd: c.USD }))
  }
  const totals: ReportSection = {
    titleKey: 'reports.totals',
    columns: [
      col('label', 'reports.metric', '', 'i18nKey'),
      col('usd', 'clients.balanceUSD', 'USD', 'money', 'end')
    ],
    rows: [
      { label: 'reports.receivablesLabel', usd: rp.receivables.USD },
      { label: 'reports.payablesLabel', usd: rp.payables.USD }
    ]
  }
  return { titleKey: 'reports.receivablesPayables', defaultTitle: 'Receivables / payables', sections: [byClient, totals] }
}

// ---------- 7. Stagnant carpets --------------------------------------------
function stagnant(db: DB, p: ReportParams): ReportResult {
  const days = p.days ?? 90
  const cutoff = Date.now() - days * 86_400_000
  const rows = db
    .select()
    .from(schema.carpets)
    .where(
      and(isNull(schema.carpets.sellTransactionId), eq(schema.carpets.archived, false), lte(schema.carpets.createdAt, cutoff))
    )
    .orderBy(asc(schema.carpets.createdAt))
    .all()
  return {
    titleKey: 'reports.stagnant',
    defaultTitle: 'Stagnant carpets',
    sections: [
      {
        columns: [
          col('label', 'carpets.label', 'Label #', 'text'),
          col('grade', 'carpets.sortGrade', 'Grade', 'text'),
          col('currency', 'carpets.currency', 'Cur', 'text'),
          col('total', 'carpets.totalPrice', 'Total', 'money', 'end'),
          col('added', 'carpets.createdAt', 'Added', 'date'),
          col('daysInStock', 'reports.daysInStock', 'Days', 'number', 'end')
        ],
        rows: rows.map((c) => ({
          label: c.labelNumber,
          grade: c.sortGrade,
          currency: c.currency,
          total: c.totalPriceCents,
          added: c.createdAt,
          daysInStock: Math.floor((Date.now() - c.createdAt) / 86_400_000)
        }))
      }
    ]
  }
}

// ---------- 8. Top clients (per currency) ----------------------------------
function topClients(db: DB, p: ReportParams): ReportResult {
  const by = p.by ?? 'purchase'
  const limit = p.limit ?? 10
  const from = rangeStart(p.fromDate)
  const to = rangeEnd(p.toDate)
  const names = new Map<number, string>()
  for (const c of db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).all()) {
    names.set(c.id, c.name)
  }

  // sales volume: sum of sale tx to a client, per currency.
  const sales = db
    .select({
      clientId: schema.transactions.clientId,
      currency: schema.transactions.currency,
      total: sql<number>`COALESCE(SUM(${schema.transactions.amountCents}),0)`
    })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.type, 'sale'),
        gte(schema.transactions.transactionDate, from),
        lte(schema.transactions.transactionDate, to)
      )
    )
    .groupBy(schema.transactions.clientId, schema.transactions.currency)
    .all()

  // profit per client: carpets sold to them + material sell lines to them.
  const profitMap = new Map<string, number>() // `${clientId}:${cur}` -> cents
  const addProfit = (clientId: number | null, cur: Currency, cents: number): void => {
    if (clientId == null) return
    const k = `${clientId}:${cur}`
    profitMap.set(k, (profitMap.get(k) ?? 0) + cents)
  }
  const soldCarpets = db
    .select()
    .from(schema.carpets)
    .where(and(isNotNull(schema.carpets.soldAt), gte(schema.carpets.soldAt, from), lte(schema.carpets.soldAt, to)))
    .all()
  for (const c of soldCarpets) {
    addProfit(c.soldToClientId, c.currency, carpetRowProfitCents(c) ?? 0)
  }
  const avg = avgBuyByMaterial(db)
  const sellLines = db
    .select()
    .from(schema.materialLines)
    .where(
      and(
        eq(schema.materialLines.direction, 'sell'),
        gte(schema.materialLines.transactionDate, from),
        lte(schema.materialLines.transactionDate, to)
      )
    )
    .all()
  for (const l of sellLines) {
    addProfit(
      l.clientId,
      l.currency,
      materialLineProfitCents(
        { direction: 'sell', currency: l.currency, kilograms: l.kilograms, pricePerKgCents: l.pricePerKgCents },
        avg.get(l.materialId) ?? 0
      )
    )
  }

  const salesMap = new Map<string, number>()
  for (const s of sales) salesMap.set(`${s.clientId}:${s.currency}`, Number(s.total))

  const sections: ReportSection[] = CURRENCIES.map((cur) => {
    const source = by === 'profit' ? profitMap : salesMap
    const entries: { clientId: number; value: number }[] = []
    for (const [k, v] of source) {
      const [cid, c] = k.split(':')
      if (c === cur) entries.push({ clientId: Number(cid), value: v })
    }
    entries.sort((a, b) => b.value - a.value)
    return {
      title: cur,
      columns: [
        col('client', 'clients.title', 'Client', 'text'),
        col('value', by === 'profit' ? 'carpets.profit' : 'reports.volume', by === 'profit' ? 'Profit' : 'Volume', 'money', 'end')
      ],
      rows: entries.slice(0, limit).map((e) => ({ client: names.get(e.clientId) ?? `#${e.clientId}`, value: e.value }))
    }
  })

  return { titleKey: 'reports.topClients', defaultTitle: 'Top clients', sections }
}

// ---------- 9. Periodic turnover -------------------------------------------
function turnover(db: DB, p: ReportParams): ReportResult {
  const fmt = p.granularity === 'day' ? '%Y-%m-%d' : '%Y-%m'
  const from = rangeStart(p.fromDate)
  const to = rangeEnd(p.toDate)
  const periodExpr = sql<string>`strftime(${fmt}, ${schema.transactions.transactionDate} / 1000, 'unixepoch')`
  const rows = db
    .select({
      period: periodExpr,
      currency: schema.transactions.currency,
      buys: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.type}='purchase' THEN -${schema.transactions.amountCents} ELSE 0 END),0)`,
      sells: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.type}='sale' THEN ${schema.transactions.amountCents} ELSE 0 END),0)`,
      paymentsIn: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.type}='payment' AND ${schema.transactions.amountCents}<0 THEN -${schema.transactions.amountCents} ELSE 0 END),0)`,
      paymentsOut: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.type}='payment' AND ${schema.transactions.amountCents}>0 THEN ${schema.transactions.amountCents} ELSE 0 END),0)`
    })
    .from(schema.transactions)
    .where(and(gte(schema.transactions.transactionDate, from), lte(schema.transactions.transactionDate, to)))
    .groupBy(periodExpr, schema.transactions.currency)
    .orderBy(periodExpr)
    .all()

  const sections: ReportSection[] = CURRENCIES.map((cur) => ({
    title: cur,
    columns: [
      col('period', 'reports.period', 'Period', 'text'),
      col('buys', 'reports.buys', 'Buys', 'money', 'end'),
      col('sells', 'reports.sells', 'Sells', 'money', 'end'),
      col('paymentsIn', 'reports.paymentsIn', 'Payments in', 'money', 'end'),
      col('paymentsOut', 'reports.paymentsOut', 'Payments out', 'money', 'end')
    ],
    rows: rows
      .filter((r) => (r.currency as Currency) === cur)
      .map((r) => ({
        period: r.period,
        buys: Number(r.buys),
        sells: Number(r.sells),
        paymentsIn: Number(r.paymentsIn),
        paymentsOut: Number(r.paymentsOut)
      }))
  }))

  return { titleKey: 'reports.turnover', defaultTitle: 'Periodic turnover', sections }
}

export function runReport(db: DB, id: ReportId, params: ReportParams): ReportResult {
  switch (id) {
    case 'clientStatement':
      return clientStatement(db, params)
    case 'warehouse':
      return warehouse(db)
    case 'periodicProfit':
      return periodicProfit(db, params)
    case 'soldList':
      return soldList(db, params)
    case 'purchasedList':
      return purchasedList(db, params)
    case 'receivablesPayables':
      return receivablesPayablesReport(db)
    case 'stagnant':
      return stagnant(db, params)
    case 'topClients':
      return topClients(db, params)
    case 'turnover':
      return turnover(db, params)
    default:
      throw new Error(`Unknown report: ${id}`)
  }
}

export function registerReportsIpc(getDb: () => DB): void {
  ipcMain.handle('reports:run', (_e, args: { id: ReportId; params: ReportParams }) =>
    runReport(getDb(), args.id, args.params ?? {})
  )
}
