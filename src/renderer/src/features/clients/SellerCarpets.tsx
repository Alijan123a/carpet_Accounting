import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { SortHeader, type SortState } from '@renderer/components/ui/sort-header'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/store/settings'
import { formatDate } from '@renderer/lib/date'
import { formatCents, formatCentsCompact, currencySymbol } from '@shared/accounting'
import type { CarpetListItem } from '@shared/contracts'

const PAGE_SIZE = 100
const ROW_HEIGHT = 48
// number | date | carpet # | SQM | price/m | total price
const GRID =
  'grid grid-cols-[44px_130px_130px_90px_140px_minmax(150px,1fr)] items-center gap-0 px-4 [&>*]:border-e [&>*]:border-border [&>*:last-child]:border-e-0 [&>*]:px-2 [&>*]:!text-center [&>*]:!justify-center'

/** One prominent statistic above the table: small label + big bold value. */
function SumStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}:</span>
      <span className="font-mono text-lg font-extrabold tabular-nums text-foreground">{value}</span>
    </span>
  )
}

/**
 * «قالین‌ها» tab of a seller: every carpet bought/received from this client,
 * with the whole filtered set's totals (quantity, متراژ, per-currency price —
 * AFN and USD are never summed together) shown boldly above the table.
 */
export function SellerCarpets({ clientId }: { clientId: number }): JSX.Element {
  const { t } = useTranslation()
  const calendar = useSettings((s) => s.calendar)

  const [sort, setSort] = useState<SortState>({ by: 'dateEpoch', dir: 'desc' })
  const [rows, setRows] = useState<CarpetListItem[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({ sqm: 0, afnCents: 0, usdCents: 0 })
  const [loading, setLoading] = useState(false)

  const rowsRef = useRef<CarpetListItem[]>([])
  const loadingRef = useRef(false)
  rowsRef.current = rows

  const fetchPage = useCallback(
    async (reset: boolean): Promise<void> => {
      if (loadingRef.current) return
      loadingRef.current = true
      setLoading(true)
      try {
        const offset = reset ? 0 : rowsRef.current.length
        const res = await window.api.carpets.list({
          boughtFromClientId: clientId,
          includeArchived: true,
          sortBy: sort.by,
          sortDir: sort.dir,
          limit: PAGE_SIZE,
          offset
        })
        setTotal(res.total)
        setStats({ sqm: res.totalSqm, afnCents: res.totalPriceAfnCents, usdCents: res.totalPriceUsdCents })
        setRows((prev) => (reset ? res.rows : [...prev, ...res.rows]))
      } finally {
        loadingRef.current = false
        setLoading(false)
      }
    },
    [clientId, sort]
  )

  useEffect(() => {
    void fetchPage(true)
  }, [fetchPage])

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  function onScroll(): void {
    const el = parentRef.current
    if (!el || rowsRef.current.length >= total) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - ROW_HEIGHT * 4) void fetchPage(false)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sums over ALL carpets from this seller (not just the loaded page). */}
      <div className="mb-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <SumStat label={t('orders.totalQty', 'Total qty')} value={String(total)} />
        <SumStat label={t('orders.totalSqm', 'Total SQM')} value={stats.sqm.toFixed(2)} />
        {stats.afnCents > 0 && (
          <SumStat
            label={t('carpets.totalPrice', 'Total')}
            value={`${formatCentsCompact(stats.afnCents)} ${currencySymbol('AFN')}`}
          />
        )}
        {stats.usdCents > 0 && (
          <SumStat
            label={t('carpets.totalPrice', 'Total')}
            value={`${formatCentsCompact(stats.usdCents)} ${currencySymbol('USD')}`}
          />
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        <div className={cn(GRID, 'h-9 shrink-0 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground')}>
          <span>{t('statement.number', '#')}</span>
          <SortHeader col="dateEpoch" sort={sort} onSort={setSort}>
            {t('statement.date', 'Date')}
          </SortHeader>
          <SortHeader col="labelNumber" sort={sort} onSort={setSort}>
            {t('statement.carpetNo', 'Carpet #')}
          </SortHeader>
          <SortHeader col="area" sort={sort} onSort={setSort}>
            {t('carpets.area', 'SQM')}
          </SortHeader>
          <SortHeader col="pricePerMeterCents" sort={sort} onSort={setSort}>
            {t('carpets.pricePerMeter', 'Price/m')}
          </SortHeader>
          <SortHeader col="totalPriceCents" sort={sort} onSort={setSort}>
            {t('carpets.totalPrice', 'Total price')}
          </SortHeader>
        </div>
        <div ref={parentRef} onScroll={onScroll} className="flex-1 overflow-auto">
          {rows.length === 0 && !loading && (
            <div className="p-8 text-center text-sm text-muted-foreground">{t('carpets.empty', 'No carpets found.')}</div>
          )}
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const c = rows[vi.index]
              return (
                <div
                  key={c.id}
                  className={cn(GRID, 'absolute start-0 top-0 w-full border-b border-border text-sm hover:bg-accent/50')}
                  style={{ height: `${ROW_HEIGHT}px`, transform: `translateY(${vi.start}px)` }}
                >
                  <span className="text-muted-foreground">{vi.index + 1}</span>
                  <span className="text-muted-foreground">{formatDate(c.dateEpoch, calendar)}</span>
                  <span className="truncate font-medium">{c.labelNumber}</span>
                  <span className="font-mono tabular-nums">{c.area.toFixed(2)}</span>
                  <span className="font-mono tabular-nums">{formatCents(c.pricePerMeterCents)}</span>
                  <span className="font-mono tabular-nums">
                    {formatCents(c.totalPriceCents)}
                    <span className="ms-1 text-xs text-muted-foreground">{currencySymbol(c.currency)}</span>
                  </span>
                </div>
              )
            })}
          </div>
          {loading && <div className="p-3 text-center text-xs text-muted-foreground">{t('common.loading', 'Loading…')}</div>}
        </div>
      </div>
    </div>
  )
}
