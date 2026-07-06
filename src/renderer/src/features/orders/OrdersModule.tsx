import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { SortHeader, type SortState } from '@renderer/components/ui/sort-header'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/store/settings'
import { formatCents } from '@shared/accounting'
import { formatDate } from '@renderer/lib/date'
import { ORDER_STATUSES } from '@shared/contracts'
import type { OrderStatus, OrderView } from '@shared/contracts'
import { OrderFormDialog } from './OrderFormDialog'
import { orderStatusLabel, orderStatusBadge } from './orderStatus'
import { DeleteConfirmDialog } from '@renderer/components/DeleteConfirmDialog'

const PAGE_SIZE = 100
const ROW_HEIGHT = 52
const GRID =
  'grid grid-cols-[100px_minmax(140px,1.2fr)_minmax(160px,1.6fr)_64px_120px_140px_92px] items-center gap-3 px-4'

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
  const [editOrder, setEditOrder] = useState<OrderView | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OrderView | null>(null)
  const [busy, setBusy] = useState(false)

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

  async function changeStatus(o: OrderView, status: OrderStatus): Promise<void> {
    await window.api.orders.setStatus(o.id, status)
    // Patch in place so the row updates without a full reload.
    setRows((prev) => prev.map((r) => (r.id === o.id ? { ...r, status } : r)))
  }

  async function doDelete(): Promise<void> {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await window.api.orders.remove(deleteTarget.id)
      setDeleteTarget(null)
      refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('orders.title', 'Orders')}</h2>
          <p className="text-xs text-muted-foreground">{t('orders.total', { total, defaultValue: '{{total}} total' })}</p>
        </div>
        <Button
          onClick={() => {
            setEditOrder(null)
            setFormOpen(true)
          }}
        >
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        <div className={cn(GRID, 'h-9 shrink-0 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground')}>
          <SortHeader col="orderDate" sort={sort} onSort={setSort}>
            {t('orders.orderDate', 'Order date')}
          </SortHeader>
          <SortHeader col="buyerName" sort={sort} onSort={setSort}>
            {t('orders.buyer', 'Buyer')}
          </SortHeader>
          <SortHeader col="title" sort={sort} onSort={setSort}>
            {t('orders.titleField', 'Ordered carpet')}
          </SortHeader>
          <SortHeader col="quantity" sort={sort} onSort={setSort} align="end">
            {t('orders.quantity', 'Qty')}
          </SortHeader>
          <SortHeader col="priceCents" sort={sort} onSort={setSort} align="end">
            {t('orders.price', 'Price')}
          </SortHeader>
          <SortHeader col="status" sort={sort} onSort={setSort}>
            {t('orders.status.label', 'Status')}
          </SortHeader>
          <span />
        </div>
        <div ref={parentRef} onScroll={onScroll} className="flex-1 overflow-auto">
          {rows.length === 0 && !loading && (
            <div className="p-8 text-center text-sm text-muted-foreground">{t('orders.empty', 'No orders yet.')}</div>
          )}
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const o = rows[vi.index]
              return (
                <div
                  key={o.id}
                  className={cn(GRID, 'absolute start-0 top-0 w-full border-b border-border text-sm')}
                  style={{ height: `${ROW_HEIGHT}px`, transform: `translateY(${vi.start}px)` }}
                >
                  <span className="text-muted-foreground">{formatDate(o.orderDate, calendar)}</span>
                  <span className="truncate font-medium">{o.buyerName || t('common.none', '—')}</span>
                  <span className="truncate">
                    {o.title}
                    {o.length && o.width ? (
                      <span className="text-muted-foreground"> · {o.length}×{o.width}m</span>
                    ) : null}
                  </span>
                  <span className="text-end text-muted-foreground">{o.quantity}</span>
                  <span className="text-end font-mono tabular-nums">
                    {o.priceCents ? `${formatCents(o.priceCents)} ${o.currency}` : '—'}
                  </span>
                  <span>
                    {/* Inline status change — the badge colour reflects the value. */}
                    <select
                      value={o.status}
                      onChange={(e) => void changeStatus(o, e.target.value as OrderStatus)}
                      className={cn(
                        'h-7 w-full rounded-md border-0 px-2 text-xs font-medium focus:ring-1 focus:ring-ring',
                        orderStatusBadge(o.status)
                      )}
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s} className="bg-card text-foreground">
                          {orderStatusLabel(t, s)}
                        </option>
                      ))}
                    </select>
                  </span>
                  <span className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={t('common.edit', 'Edit')}
                      onClick={() => {
                        setEditOrder(o)
                        setFormOpen(true)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={t('common.delete', 'Delete')}
                      onClick={() => setDeleteTarget(o)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </span>
                </div>
              )
            })}
          </div>
          {loading && <div className="p-3 text-center text-xs text-muted-foreground">{t('common.loading', 'Loading…')}</div>}
        </div>
      </div>

      <OrderFormDialog open={formOpen} onOpenChange={setFormOpen} order={editOrder} onSaved={refresh} />
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t('orders.deleteConfirmTitle', 'Delete this order?')}
        body={t('orders.deleteConfirmBody', 'This permanently removes the order.')}
        expectedText={deleteTarget?.title ?? ''}
        busy={busy}
        onConfirm={doDelete}
      />
    </div>
  )
}
