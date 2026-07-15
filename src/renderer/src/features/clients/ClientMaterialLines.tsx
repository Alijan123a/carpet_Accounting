import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { SortHeader, type SortState } from '@renderer/components/ui/sort-header'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/store/settings'
import { formatDate } from '@renderer/lib/date'
import { formatCents, formatCentsCompact, currencySymbol } from '@shared/accounting'
import type { ClientMaterialLineView } from '@shared/contracts'

const ROW_HEIGHT = 48
// number | date | direction | tar type | weight | price/kg | total price
const GRID =
  'grid grid-cols-[44px_120px_90px_minmax(120px,1fr)_100px_130px_150px] items-center gap-0 px-4 [&>*]:border-e [&>*]:border-border [&>*:last-child]:border-e-0 [&>*]:px-2 [&>*]:!text-center [&>*]:!justify-center'

function SumStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}:</span>
      <span className="font-mono text-lg font-extrabold tabular-nums text-foreground">{value}</span>
    </span>
  )
}

/**
 * «حساب تار» tab: every tar/material line of one client — buys for a tar
 * seller (we bought from them), sells for a seller (tar we gave them); a mixed
 * history shows both, told apart by the direction column. All of a client's
 * lines are loaded at once (they are few), so sorting happens client-side.
 */
export function ClientMaterialLines({ clientId }: { clientId: number }): JSX.Element {
  const { t } = useTranslation()
  const calendar = useSettings((s) => s.calendar)

  const [lines, setLines] = useState<ClientMaterialLineView[]>([])
  const [loading, setLoading] = useState(false)
  const [sort, setSort] = useState<SortState>({ by: 'transactionDate', dir: 'desc' })

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setLines(await window.api.materials.linesForClient(clientId))
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    const cmp = (a: ClientMaterialLineView, b: ClientMaterialLineView): number => {
      switch (sort.by) {
        case 'materialName':
          return a.materialName.localeCompare(b.materialName, undefined, { numeric: true })
        case 'kilograms':
          return a.kilograms - b.kilograms
        case 'pricePerKgCents':
          return a.pricePerKgCents - b.pricePerKgCents
        case 'totalCents':
          return a.totalCents - b.totalCents
        default:
          return a.transactionDate - b.transactionDate
      }
    }
    return [...lines].sort((a, b) => dir * cmp(a, b) || a.id - b.id)
  }, [lines, sort])

  // Totals across all lines: kg plus per-currency money (AFN/USD never mixed).
  const totals = useMemo(() => {
    const acc = { kg: 0, afnCents: 0, usdCents: 0 }
    for (const l of lines) {
      acc.kg += l.kilograms
      if (l.currency === 'USD') acc.usdCents += l.totalCents
      else acc.afnCents += l.totalCents
    }
    return acc
  }, [lines])

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <SumStat label={t('orders.totalQty', 'Total qty')} value={String(lines.length)} />
        <SumStat label={t('tar.totalKg', 'Total kg')} value={totals.kg.toFixed(2)} />
        {totals.afnCents > 0 && (
          <SumStat
            label={t('carpets.totalPrice', 'Total')}
            value={`${formatCentsCompact(totals.afnCents)} ${currencySymbol('AFN')}`}
          />
        )}
        {totals.usdCents > 0 && (
          <SumStat
            label={t('carpets.totalPrice', 'Total')}
            value={`${formatCentsCompact(totals.usdCents)} ${currencySymbol('USD')}`}
          />
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        <div className={cn(GRID, 'h-9 shrink-0 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground')}>
          <span>{t('statement.number', '#')}</span>
          <SortHeader col="transactionDate" sort={sort} onSort={setSort}>
            {t('statement.date', 'Date')}
          </SortHeader>
          <span>{t('material.direction', 'Direction')}</span>
          <SortHeader col="materialName" sort={sort} onSort={setSort}>
            {t('tar.type', 'Tar type')}
          </SortHeader>
          <SortHeader col="kilograms" sort={sort} onSort={setSort}>
            {t('tar.weight', 'Weight (kg)')}
          </SortHeader>
          <SortHeader col="pricePerKgCents" sort={sort} onSort={setSort}>
            {t('material.pricePerKg', 'Price / kg')}
          </SortHeader>
          <SortHeader col="totalCents" sort={sort} onSort={setSort}>
            {t('carpets.totalPrice', 'Total price')}
          </SortHeader>
        </div>
        <div ref={parentRef} className="flex-1 overflow-auto">
          {visible.length === 0 && !loading && (
            <div className="p-8 text-center text-sm text-muted-foreground">{t('tar.empty', 'No tar records yet.')}</div>
          )}
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const l = visible[vi.index]
              return (
                <div
                  key={l.id}
                  className={cn(GRID, 'absolute start-0 top-0 w-full border-b border-border text-sm hover:bg-accent/50')}
                  style={{ height: `${ROW_HEIGHT}px`, transform: `translateY(${vi.start}px)` }}
                >
                  <span className="text-muted-foreground">{vi.index + 1}</span>
                  <span className="text-muted-foreground">{formatDate(l.transactionDate, calendar)}</span>
                  <span
                    className={cn(
                      'text-xs font-medium',
                      l.direction === 'buy'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-green-600 dark:text-green-400'
                    )}
                  >
                    {l.direction === 'buy' ? t('material.buy', 'Buy') : t('material.sell', 'Sell')}
                  </span>
                  <span className="truncate font-medium">{l.materialName}</span>
                  <span className="font-mono tabular-nums">{l.kilograms}</span>
                  <span className="font-mono tabular-nums">{formatCents(l.pricePerKgCents)}</span>
                  <span className="font-mono tabular-nums">
                    {formatCents(l.totalCents)}
                    <span className="ms-1 text-xs text-muted-foreground">{currencySymbol(l.currency)}</span>
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
