import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Input } from '@renderer/components/ui/input'
import { DateInput } from '@renderer/components/ui/date-input'
import { SortHeader, type SortState } from '@renderer/components/ui/sort-header'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/store/settings'
import { formatDate, startOfDayEpoch, endOfDayEpoch } from '@renderer/lib/date'
import { formatCentsCompact, currencySymbol } from '@shared/accounting'
import type { BuyerBillSummary } from '@shared/contracts'
import { BillDetailDialog } from './BillDetailDialog'

const ROW_HEIGHT = 48
const GRID =
  'grid grid-cols-[130px_130px_110px_120px_minmax(140px,1fr)] items-center gap-0 px-4 [&>*]:border-e [&>*]:border-border [&>*:last-child]:border-e-0 [&>*]:px-2 [&>*]:!text-center [&>*]:!justify-center'

/**
 * Buyer bills view: the buyer's sell invoices, one row per bill, showing the
 * total price, total متراژ and carpet count. Filterable by date range and bill
 * number, sortable on every column (like the statement). Double-clicking a row
 * opens the bill's full detail (and its export / print chooser).
 *
 * All of one buyer's bills are already loaded by `listForBuyer`, so filtering
 * and sorting happen client-side over that array.
 */
export function BuyerBills({ clientId }: { clientId: number }): JSX.Element {
  const { t } = useTranslation()
  const calendar = useSettings((s) => s.calendar)

  const [bills, setBills] = useState<BuyerBillSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)

  // Filters + sort (client-side).
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortState>({ by: 'transactionDate', dir: 'desc' })

  useEffect(() => {
    const h = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(h)
  }, [searchInput])

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setBills(await window.api.invoices.listForBuyer(clientId))
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const fromEpoch = startOfDayEpoch(from)
    const toEpoch = endOfDayEpoch(to)
    const q = search.trim().toLowerCase()
    const filtered = bills.filter((b) => {
      if (fromEpoch != null && b.transactionDate < fromEpoch) return false
      if (toEpoch != null && b.transactionDate > toEpoch) return false
      if (q && !b.number.toLowerCase().includes(q)) return false
      return true
    })

    const dir = sort.dir === 'asc' ? 1 : -1
    const cmp = (a: BuyerBillSummary, b: BuyerBillSummary): number => {
      switch (sort.by) {
        case 'number':
          // Bill numbers are mostly numeric strings — compare them numerically.
          return a.number.localeCompare(b.number, undefined, { numeric: true })
        case 'carpetCount':
          return a.carpetCount - b.carpetCount
        case 'totalSqm':
          return a.totalSqm - b.totalSqm
        case 'totalCents':
          return a.totalCents - b.totalCents
        default:
          return a.transactionDate - b.transactionDate
      }
    }
    return [...filtered].sort((a, b) => dir * cmp(a, b) || a.id - b.id)
  }, [bills, from, to, search, sort])

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  // Per-currency totals across the FILTERED bills (AFN and USD never summed together).
  const totals = useMemo(() => {
    const acc = { afnCents: 0, usdCents: 0, sqm: 0, carpets: 0 }
    for (const b of visible) {
      if (b.currency === 'USD') acc.usdCents += b.totalCents
      else acc.afnCents += b.totalCents
      acc.sqm += b.totalSqm
      acc.carpets += b.carpetCount
    }
    return acc
  }, [visible])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Filters (like the statement: date range + bill-number search) */}
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">{t('statement.from', 'From')}</span>
          <DateInput value={from} onChange={setFrom} className="h-9 w-56" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">{t('statement.to', 'To')}</span>
          <DateInput value={to} onChange={setTo} className="h-9 w-56" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">{t('statement.search', 'Search')}</span>
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('bills.searchPlaceholder', 'Bill #…')}
            className="h-9 w-52"
          />
        </label>
      </div>

      <p className="mb-2 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
        <span>{t('bills.count', { count: visible.length, defaultValue: '{{count}} bills' })}</span>
        <span className="font-mono tabular-nums">
          {t('bills.carpets', 'Carpets')}: {totals.carpets}
        </span>
        <span className="font-mono tabular-nums">
          {t('bills.totalSqm', 'Total SQM')}: {totals.sqm.toFixed(2)}
        </span>
        {totals.afnCents > 0 && (
          <span className="font-mono tabular-nums">
            {formatCentsCompact(totals.afnCents)} {currencySymbol('AFN')}
          </span>
        )}
        {totals.usdCents > 0 && (
          <span className="font-mono tabular-nums">
            {formatCentsCompact(totals.usdCents)} {currencySymbol('USD')}
          </span>
        )}
      </p>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        <div className={cn(GRID, 'h-9 shrink-0 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground')}>
          <SortHeader col="number" sort={sort} onSort={setSort}>
            {t('bills.billNo', 'Bill #')}
          </SortHeader>
          <SortHeader col="transactionDate" sort={sort} onSort={setSort}>
            {t('bills.date', 'Date')}
          </SortHeader>
          <SortHeader col="carpetCount" sort={sort} onSort={setSort}>
            {t('bills.carpets', 'Carpets')}
          </SortHeader>
          <SortHeader col="totalSqm" sort={sort} onSort={setSort}>
            {t('bills.totalSqm', 'Total SQM')}
          </SortHeader>
          <SortHeader col="totalCents" sort={sort} onSort={setSort}>
            {t('bills.totalPrice', 'Total price')}
          </SortHeader>
        </div>
        <div ref={parentRef} className="flex-1 overflow-auto">
          {visible.length === 0 && !loading && (
            <div className="p-8 text-center text-sm text-muted-foreground">{t('bills.empty', 'No bills yet.')}</div>
          )}
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const b = visible[vi.index]
              return (
                <div
                  key={b.id}
                  onDoubleClick={() => setDetailId(b.id)}
                  title={t('bills.openHint', 'Double-click to see the bill and export it')}
                  className={cn(
                    GRID,
                    'absolute start-0 top-0 w-full cursor-pointer border-b border-border text-sm hover:bg-accent/50'
                  )}
                  style={{ height: `${ROW_HEIGHT}px`, transform: `translateY(${vi.start}px)` }}
                >
                  <span className="truncate font-medium">{b.number}</span>
                  <span className="text-muted-foreground">{formatDate(b.transactionDate, calendar)}</span>
                  <span className="font-mono tabular-nums">{b.carpetCount}</span>
                  <span className="font-mono tabular-nums">{b.totalSqm.toFixed(2)}</span>
                  <span className="font-mono tabular-nums">
                    {formatCentsCompact(b.totalCents)} {currencySymbol(b.currency)}
                  </span>
                </div>
              )
            })}
          </div>
          {loading && <div className="p-3 text-center text-xs text-muted-foreground">{t('common.loading', 'Loading…')}</div>}
        </div>
      </div>

      <BillDetailDialog
        invoiceId={detailId}
        open={detailId !== null}
        onOpenChange={(o) => !o && setDetailId(null)}
      />
    </div>
  )
}
