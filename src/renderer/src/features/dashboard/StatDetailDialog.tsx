import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { useSettings } from '@renderer/store/settings'
import { formatDate } from '@renderer/lib/date'
import { formatCents, currencySymbol, type Currency, type PerCurrency } from '@shared/accounting'
import type { ClientBalanceRow, DashboardProfitDetail, DashboardStockDetail } from '@shared/contracts'
import { BalanceAmount } from '@renderer/features/clients/BalanceAmount'
import { cn } from '@renderer/lib/utils'

/** Which dashboard KPI tile was clicked. */
export type StatKind = 'receivables' | 'payables' | 'profit' | 'warehouse' | 'materialStock'

const CURRENCIES: Currency[] = ['USD', 'AFN']

/**
 * Detail popup for a dashboard KPI tile. Each statistic expands into the rows
 * it was computed from: per-client balances, the period's profit entries
 * (carpets / material / expenses), or the stock lists. AFN and USD are always
 * shown separately — never summed together (CLAUDE.md §3).
 */
export function StatDetailDialog({
  kind,
  range,
  rangeLabel,
  onClose
}: {
  kind: StatKind | null
  range: { fromDate: number; toDate: number }
  rangeLabel: string
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation()

  const [balances, setBalances] = useState<ClientBalanceRow[] | null>(null)
  const [profit, setProfit] = useState<DashboardProfitDetail | null>(null)
  const [stock, setStock] = useState<DashboardStockDetail | null>(null)

  useEffect(() => {
    if (!kind) return
    if (kind === 'receivables' || kind === 'payables') {
      setBalances(null)
      void window.api.dashboard.balancesByClient().then(setBalances)
    } else if (kind === 'profit') {
      setProfit(null)
      void window.api.dashboard.profitDetail(range).then(setProfit)
    } else {
      setStock(null)
      void window.api.dashboard.stockDetail().then(setStock)
    }
  }, [kind, range])

  const titles: Record<StatKind, string> = {
    receivables: t('dashboard.detail.receivablesTitle', 'Receivables — by client'),
    payables: t('dashboard.detail.payablesTitle', 'Payables — by client'),
    profit: t('dashboard.detail.profitTitle', 'Net profit — details'),
    warehouse: t('dashboard.detail.warehouseTitle', 'Carpets in warehouse'),
    materialStock: t('dashboard.detail.materialTitle', 'Material stock')
  }
  // The balance popups always reflect the CURRENT open balances; only the
  // profit breakdown follows the dashboard's date-range filter.
  const showRange = kind === 'profit'

  return (
    <Dialog open={kind !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{kind ? titles[kind] : ''}</DialogTitle>
          {showRange && <DialogDescription>{rangeLabel}</DialogDescription>}
        </DialogHeader>

        {(kind === 'receivables' || kind === 'payables') && (
          <BalancesDetail kind={kind} rows={balances} />
        )}
        {kind === 'profit' && <ProfitDetail data={profit} />}
        {kind === 'warehouse' && <WarehouseDetail data={stock} />}
        {kind === 'materialStock' && <MaterialStockDetail data={stock} />}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.close', 'Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Loading(): JSX.Element {
  const { t } = useTranslation()
  return <p className="py-6 text-center text-sm text-muted-foreground">{t('common.loading', 'Loading…')}</p>
}

function Empty(): JSX.Element {
  const { t } = useTranslation()
  return <p className="py-6 text-center text-sm text-muted-foreground">{t('dashboard.detail.empty', 'Nothing to show.')}</p>
}

function SectionTitle({ children }: { children: React.ReactNode }): JSX.Element {
  return <h3 className="mt-1 text-sm font-semibold text-foreground">{children}</h3>
}

const TABLE = 'overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card'
const HEAD = 'grid items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground [&>span]:text-center'
const ROW = 'grid items-center gap-2 border-b border-border px-3 py-1.5 text-sm last:border-b-0 [&>span]:text-center'

/** Receivables (>0) or payables (<0) per client, both currencies side by side. */
function BalancesDetail({ kind, rows }: { kind: 'receivables' | 'payables'; rows: ClientBalanceRow[] | null }): JSX.Element {
  const { t } = useTranslation()
  const filtered = useMemo(() => {
    if (!rows) return []
    return kind === 'receivables'
      ? rows.filter((r) => r.AFN > 0 || r.USD > 0)
      : rows.filter((r) => r.AFN < 0 || r.USD < 0)
  }, [rows, kind])

  const totals = useMemo(() => {
    const sum: PerCurrency = { AFN: 0, USD: 0 }
    for (const r of filtered) {
      for (const cur of CURRENCIES) {
        const v = r[cur]
        if (kind === 'receivables' ? v > 0 : v < 0) sum[cur] += v
      }
    }
    return sum
  }, [filtered, kind])

  if (!rows) return <Loading />
  if (!filtered.length) return <Empty />

  const grid = 'grid-cols-[minmax(140px,1.5fr)_120px_120px]'
  // Only the side of a balance that belongs to this popup is shown: a client
  // can owe us USD (receivable) while we owe them AFN (payable).
  const show = (v: number): boolean => (kind === 'receivables' ? v > 0 : v < 0)
  return (
    <div className={TABLE}>
      <div className={cn(HEAD, grid)}>
        <span>{t('dashboard.detail.client', 'Client')}</span>
        <span>{currencySymbol('USD')}</span>
        <span>{currencySymbol('AFN')}</span>
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        {filtered.map((r) => (
          <div key={r.id} className={cn(ROW, grid)}>
            <span className="truncate font-medium">{r.name}</span>
            <span>{show(r.USD) ? <BalanceAmount cents={r.USD} /> : <span className="text-muted-foreground">—</span>}</span>
            <span>{show(r.AFN) ? <BalanceAmount cents={r.AFN} /> : <span className="text-muted-foreground">—</span>}</span>
          </div>
        ))}
      </div>
      <div className={cn(ROW, grid, 'bg-muted/30 font-semibold')}>
        <span>{t('dashboard.detail.total', 'Total')}</span>
        <span>
          <BalanceAmount cents={totals.USD} />
        </span>
        <span>
          <BalanceAmount cents={totals.AFN} />
        </span>
      </div>
    </div>
  )
}

/** Signed profit amount: gains green, losses red. */
function ProfitAmount({ cents }: { cents: number }): JSX.Element {
  return <BalanceAmount cents={cents} />
}

/** The period's profit entries: sold carpets, material sales, expenses, totals. */
function ProfitDetail({ data }: { data: DashboardProfitDetail | null }): JSX.Element {
  const { t } = useTranslation()
  const calendar = useSettings((s) => s.calendar)

  const totals = useMemo(() => {
    const zero = (): PerCurrency => ({ AFN: 0, USD: 0 })
    const gross = zero()
    const expenses = zero()
    if (data) {
      for (const c of data.carpets) gross[c.currency] += c.profitCents
      for (const m of data.materials) gross[m.currency] += m.profitCents
      for (const e of data.expenses) expenses[e.currency] += e.amountCents
    }
    return { gross, expenses }
  }, [data])

  if (!data) return <Loading />
  if (!data.carpets.length && !data.materials.length && !data.expenses.length) return <Empty />

  const carpetGrid = 'grid-cols-[90px_110px_minmax(110px,1.2fr)_110px_110px]'
  const materialGrid = 'grid-cols-[minmax(110px,1.2fr)_110px_minmax(110px,1.2fr)_90px_110px]'
  const expenseGrid = 'grid-cols-[minmax(120px,1.4fr)_110px_120px]'

  return (
    <div className="space-y-4">
      {data.carpets.length > 0 && (
        <div className="space-y-2">
          <SectionTitle>{t('dashboard.detail.soldCarpets', 'Sold carpets')}</SectionTitle>
          <div className={TABLE}>
            <div className={cn(HEAD, carpetGrid)}>
              <span>{t('carpets.label', 'Label #')}</span>
              <span>{t('statement.date', 'Date')}</span>
              <span>{t('dashboard.detail.buyer', 'Buyer')}</span>
              <span>{t('dashboard.detail.sellTotal', 'Sell total')}</span>
              <span>{t('carpets.profit', 'Profit')}</span>
            </div>
            <div className="max-h-[36vh] overflow-y-auto">
              {data.carpets.map((c) => (
                <div key={c.id} className={cn(ROW, carpetGrid)}>
                  <span className="truncate font-medium">{c.label}</span>
                  <span className="text-muted-foreground">{formatDate(c.date, calendar)}</span>
                  <span className="truncate">{c.buyerName ?? t('common.none', '—')}</span>
                  <span className="font-mono tabular-nums">
                    {formatCents(c.sellTotalCents)} {currencySymbol(c.currency)}
                  </span>
                  <span>
                    <ProfitAmount cents={c.profitCents} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {data.materials.length > 0 && (
        <div className="space-y-2">
          <SectionTitle>{t('dashboard.detail.soldMaterial', 'Material sales')}</SectionTitle>
          <div className={TABLE}>
            <div className={cn(HEAD, materialGrid)}>
              <span>{t('material.name', 'Material')}</span>
              <span>{t('statement.date', 'Date')}</span>
              <span>{t('dashboard.detail.buyer', 'Buyer')}</span>
              <span>{t('material.kilograms', 'kg')}</span>
              <span>{t('carpets.profit', 'Profit')}</span>
            </div>
            <div className="max-h-[30vh] overflow-y-auto">
              {data.materials.map((m) => (
                <div key={m.id} className={cn(ROW, materialGrid)}>
                  <span className="truncate font-medium">{m.name}</span>
                  <span className="text-muted-foreground">{formatDate(m.date, calendar)}</span>
                  <span className="truncate">{m.buyerName ?? t('common.none', '—')}</span>
                  <span className="font-mono tabular-nums">{m.kilograms.toLocaleString('en-US')}</span>
                  <span>
                    <ProfitAmount cents={m.profitCents} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {data.expenses.length > 0 && (
        <div className="space-y-2">
          <SectionTitle>{t('dashboard.detail.expenses', 'Expenses')}</SectionTitle>
          <div className={TABLE}>
            <div className={cn(HEAD, expenseGrid)}>
              <span>{t('expenses.category', 'Category')}</span>
              <span>{t('statement.date', 'Date')}</span>
              <span>{t('statement.amount', 'Amount')}</span>
            </div>
            <div className="max-h-[30vh] overflow-y-auto">
              {data.expenses.map((e) => (
                <div key={e.id} className={cn(ROW, expenseGrid)}>
                  <span className="truncate font-medium">{e.category}</span>
                  <span className="text-muted-foreground">{formatDate(e.date, calendar)}</span>
                  <span className="font-mono tabular-nums">
                    {formatCents(e.amountCents)} {currencySymbol(e.currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Per-currency totals: gross − expenses = net. Never summed across currencies. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {CURRENCIES.map((cur) => {
          const gross = totals.gross[cur]
          const expenses = totals.expenses[cur]
          if (gross === 0 && expenses === 0) return null
          return (
            <div key={cur} className="rounded-2xl border border-border/70 bg-muted/20 p-3 text-sm">
              <div className="mb-1 font-semibold">{currencySymbol(cur)}</div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dashboard.detail.gross', 'Gross profit')}</span>
                <ProfitAmount cents={gross} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dashboard.expensesShare', 'Expenses')}</span>
                <span className="font-mono tabular-nums">{formatCents(expenses)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
                <span>{t('dashboard.netProfit', 'Net profit')}</span>
                <ProfitAmount cents={gross - expenses} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** In-warehouse carpets with per-currency value totals. */
function WarehouseDetail({ data }: { data: DashboardStockDetail | null }): JSX.Element {
  const { t } = useTranslation()

  const totals = useMemo(() => {
    const sum: PerCurrency = { AFN: 0, USD: 0 }
    let sqm = 0
    for (const c of data?.carpets ?? []) {
      sum[c.currency] += c.totalPriceCents
      sqm += c.area
    }
    return { sum, sqm }
  }, [data])

  if (!data) return <Loading />
  if (!data.carpets.length) return <Empty />

  const grid = 'grid-cols-[110px_90px_100px_minmax(120px,1fr)]'
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {t('dashboard.detail.warehouseSummary', '{{count}} carpets — {{sqm}} m²', {
          count: data.carpets.length,
          sqm: totals.sqm.toFixed(2)
        })}
        {totals.sum.USD > 0 && (
          <span className="ms-3 font-mono tabular-nums">
            {formatCents(totals.sum.USD)} {currencySymbol('USD')}
          </span>
        )}
        {totals.sum.AFN > 0 && (
          <span className="ms-3 font-mono tabular-nums">
            {formatCents(totals.sum.AFN)} {currencySymbol('AFN')}
          </span>
        )}
      </p>
      <div className={TABLE}>
        <div className={cn(HEAD, grid)}>
          <span>{t('carpets.label', 'Label #')}</span>
          <span>{t('carpets.area', 'Area')}</span>
          <span>{t('carpets.sortGrade', 'Grade')}</span>
          <span>{t('carpets.totalPrice', 'Total price')}</span>
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {data.carpets.map((c) => (
            <div key={c.id} className={cn(ROW, grid)}>
              <span className="truncate font-medium">{c.label}</span>
              <span className="font-mono tabular-nums">{c.area.toFixed(2)}</span>
              <span className="truncate text-muted-foreground">{c.sortGrade ?? '—'}</span>
              <span className="font-mono tabular-nums">
                {formatCents(c.totalPriceCents)} {currencySymbol(c.currency)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Material lots and their stock on hand. */
function MaterialStockDetail({ data }: { data: DashboardStockDetail | null }): JSX.Element {
  const { t } = useTranslation()

  if (!data) return <Loading />
  const rows = data.materials.filter((m) => m.stockKg !== 0)
  if (!rows.length) return <Empty />

  const grid = 'grid-cols-[minmax(140px,1.5fr)_110px_110px]'
  const totalKg = rows.reduce((s, m) => s + m.stockKg, 0)
  return (
    <div className={TABLE}>
      <div className={cn(HEAD, grid)}>
        <span>{t('material.name', 'Material')}</span>
        <span>{t('material.currency', 'Cur')}</span>
        <span>{t('material.stock', 'Stock (kg)')}</span>
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        {rows.map((m) => (
          <div key={m.id} className={cn(ROW, grid)}>
            <span className="truncate font-medium">{m.name}</span>
            <span className="text-muted-foreground">{currencySymbol(m.currency)}</span>
            <span className="font-mono tabular-nums">{m.stockKg.toLocaleString('en-US', { maximumFractionDigits: 3 })}</span>
          </div>
        ))}
      </div>
      <div className={cn(ROW, grid, 'bg-muted/30 font-semibold')}>
        <span>{t('dashboard.detail.total', 'Total')}</span>
        <span />
        <span className="font-mono tabular-nums">{totalKg.toLocaleString('en-US', { maximumFractionDigits: 3 })}</span>
      </div>
    </div>
  )
}
