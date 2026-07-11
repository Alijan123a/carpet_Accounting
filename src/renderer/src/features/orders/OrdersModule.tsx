import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Plus } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { SortHeader, type SortState } from '@renderer/components/ui/sort-header'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/store/settings'
import { formatDate } from '@renderer/lib/date'
import { ORDER_STATUSES, ORDER_ITEM_STATUSES } from '@shared/contracts'
import type { OrderStatus, OrderItemStatus, OrderView } from '@shared/contracts'
import { OrderFormDialog } from './OrderFormDialog'
import { OrderDetail } from './OrderDetail'
import { orderStatusLabel, orderItemStatusLabel, orderItemStatusText, statusCounts } from './orderStatus'

const PAGE_SIZE = 100
const ROW_HEIGHT = 52
// date | order# | buyer | ordered carpet | qty | sqm | 4×status counts
const GRID =
  'grid grid-cols-[100px_80px_minmax(130px,1.1fr)_minmax(150px,1.4fr)_60px_84px_repeat(4,minmax(54px,0.7fr))] items-center gap-0 px-4 [&>*]:border-e [&>*]:border-border [&>*:last-child]:border-e-0 [&>*]:px-2 [&>*]:text-center [&>*]:justify-center'
const MIN_W = 'min-w-[940px]'

/** Total متراژ of an order: sum of item rows, falling back to legacy W×L. */
function orderTotalSqm(o: OrderView): number | null {
  if (o.items.length) {
    const s = o.items.reduce((sum, it) => sum + (it.sqm ?? 0), 0)
    return s > 0 ? s : null
  }
  return o.length && o.width ? o.length * o.width : null
}

/**
 * Piece counts per item-status for a whole order (sum across its carpet items).
 * Legacy orders without an items snapshot count their whole quantity as pending.
 */
function orderStatusCounts(o: OrderView): Record<OrderItemStatus, number> {
  const counts: Record<OrderItemStatus, number> = { pending: 0, on_work: 0, complete: 0, delivered: 0 }
  if (o.items.length) {
    for (const it of o.items) {
      const c = statusCounts(it)
      for (const s of ORDER_ITEM_STATUSES) counts[s] += c[s]
    }
  } else {
    counts.pending += o.quantity > 0 ? o.quantity : 0
  }
  return counts
}

export function OrdersModule(): JSX.Element {
  const { t } = useTranslation()
  const { calendar } = useSettings()

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [sort, setSort] = useState<SortState>({ by: 'orderDate', dir: 'desc' })

  const [rows, setRows] = useState<OrderView[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const rowsRef = useRef<OrderView[]>([])
  const loadingRef = useRef(false)
  rowsRef.current = rows

  useEffect(() => {
    const h = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(h)
  }, [searchInput])

  const fetchPage = useCallback(
    async (reset: boolean): Promise<void> => {
      if (loadingRef.current) return
      loadingRef.current = true
      setLoading(true)
      try {
        const offset = reset ? 0 : rowsRef.current.length
        const res = await window.api.orders.list({
          search,
          status: statusFilter,
          includeArchived,
          sortBy: sort.by,
          sortDir: sort.dir,
          limit: PAGE_SIZE,
          offset
        })
        setTotal(res.total)
        setRows((prev) => (reset ? res.rows : [...prev, ...res.rows]))
      } finally {
        loadingRef.current = false
        setLoading(false)
      }
    },
    [search, statusFilter, includeArchived, sort]
  )
  useEffect(() => {
    void fetchPage(true)
  }, [fetchPage])

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10
  })
  function onScroll(): void {
    const el = parentRef.current
    if (!el || rowsRef.current.length >= total) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - ROW_HEIGHT * 4) void fetchPage(false)
  }
  function refresh(): void {
    void fetchPage(true)
  }

  if (selectedId !== null) {
    return (
      <OrderDetail
        orderId={selectedId}
        onBack={() => {
          setSelectedId(null)
          refresh()
        }}
        onChanged={refresh}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('orders.title', 'Orders')}</h2>
          <p className="text-xs text-muted-foreground">{t('orders.total', { total, defaultValue: '{{total}} total' })}</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('orders.add', 'New order')}
        </Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('orders.searchPlaceholder', 'Search buyer, carpet, quality…')}
          className="h-9 max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
          className="h-9 rounded-lg border border-input bg-card shadow-soft px-2 text-sm"
        >
          <option value="all">{t('orders.allStatuses', 'All statuses')}</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {orderStatusLabel(t, s)}
            </option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          {t('clients.includeArchived', 'Show archived')}
        </label>
      </div>

      <div className="flex min-h-0 flex-1 overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-card">
        <div className={cn(MIN_W, 'flex flex-1 flex-col')}>
          <div className={cn(GRID, 'h-9 shrink-0 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground')}>
            <SortHeader col="orderDate" sort={sort} onSort={setSort}>
              {t('orders.orderDate', 'Order date')}
            </SortHeader>
            <SortHeader col="orderNo" sort={sort} onSort={setSort}>
              {t('orders.orderNo', 'Order #')}
            </SortHeader>
            <SortHeader col="buyerName" sort={sort} onSort={setSort}>
              {t('orders.buyer', 'Buyer')}
            </SortHeader>
            <SortHeader col="title" sort={sort} onSort={setSort}>
              {t('orders.titleField', 'Ordered carpet')}
            </SortHeader>
            <SortHeader col="quantity" sort={sort} onSort={setSort}>
              {t('orders.quantity', 'Qty')}
            </SortHeader>
            <span>{t('orders.sqm', 'SQM')}</span>
            {/* One column per carpet status showing the piece count. */}
            {ORDER_ITEM_STATUSES.map((s) => (
              <span key={s} className="truncate" title={orderItemStatusLabel(t, s)}>
                {orderItemStatusLabel(t, s)}
              </span>
            ))}
          </div>
          <div ref={parentRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
            {rows.length === 0 && !loading && (
              <div className="p-8 text-center text-sm text-muted-foreground">{t('orders.empty', 'No orders yet.')}</div>
            )}
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
              {virtualizer.getVirtualItems().map((vi) => {
                const o = rows[vi.index]
                const counts = orderStatusCounts(o)
                return (
                  <div
                    key={o.id}
                    onDoubleClick={() => setSelectedId(o.id)}
                    title={t('orders.openHint', 'Double-click to open carpets')}
                    className={cn(
                      GRID,
                      'absolute start-0 top-0 w-full cursor-pointer border-b border-border text-sm hover:bg-accent/40'
                    )}
                    style={{ height: `${ROW_HEIGHT}px`, transform: `translateY(${vi.start}px)` }}
                  >
                    <span className="text-muted-foreground">{formatDate(o.orderDate, calendar)}</span>
                    <span className="truncate font-mono tabular-nums">{o.orderNo || t('common.none', '—')}</span>
                    <span className="truncate font-medium">{o.buyerName || t('common.none', '—')}</span>
                    <span className="truncate">
                      {o.title}
                      {!o.items.length && o.length && o.width ? (
                        <span className="text-muted-foreground"> · {o.length}×{o.width}m</span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground">{o.quantity}</span>
                    <span className="font-mono tabular-nums">{orderTotalSqm(o)?.toFixed(2) ?? t('common.none', '—')}</span>
                    {ORDER_ITEM_STATUSES.map((s) => (
                      <span
                        key={s}
                        className={cn(
                          'font-mono tabular-nums',
                          counts[s] > 0 ? cn('font-semibold', orderItemStatusText(s)) : 'text-muted-foreground/40'
                        )}
                      >
                        {counts[s]}
                      </span>
                    ))}
                  </div>
                )
              })}
            </div>
            {loading && <div className="p-3 text-center text-xs text-muted-foreground">{t('common.loading', 'Loading…')}</div>}
          </div>
        </div>
      </div>

      <OrderFormDialog open={formOpen} onOpenChange={setFormOpen} order={null} onSaved={refresh} />
    </div>
  )
}
