import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, UserPlus, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/store/settings'
import { formatDate } from '@renderer/lib/date'
import { ORDER_ITEM_STATUSES } from '@shared/contracts'
import type { ClientListItem, OrderItem, OrderItemStatus, OrderView } from '@shared/contracts'
import { orderStatusLabel, orderStatusBadge, orderItemStatusLabel, orderItemStatusBadge } from './orderStatus'
import { AssignSellerDialog } from './AssignSellerDialog'

const GRID =
  'grid grid-cols-[36px_36px_minmax(160px,1.6fr)_96px_78px_52px_minmax(120px,1.3fr)_150px] items-center gap-2 px-3'

const itemStatus = (it: OrderItem): OrderItemStatus => it.status ?? 'pending'
const itemSqm = (it: OrderItem): number => it.sqm ?? 0
const itemQty = (it: OrderItem): number => (it.quantity > 0 ? it.quantity : 0)

export function OrderDetail({
  orderId,
  onBack,
  onChanged
}: {
  orderId: number
  onBack: () => void
  onChanged: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const { calendar } = useSettings()
  const [order, setOrder] = useState<OrderView | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [assignOpen, setAssignOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    const o = await window.api.orders.get(orderId)
    setOrder(o)
    setItems(o?.items ?? [])
    setSelected(new Set())
  }, [orderId])

  useEffect(() => {
    void load()
  }, [load])

  // Persist the full item snapshot after any per-carpet edit, then refresh the list.
  const persist = useCallback(
    async (next: OrderItem[]): Promise<void> => {
      setItems(next)
      setBusy(true)
      try {
        await window.api.orders.updateItems(orderId, next)
        onChanged()
      } finally {
        setBusy(false)
      }
    },
    [orderId, onChanged]
  )

  const stats = useMemo(() => {
    const counts: Record<OrderItemStatus, number> = { pending: 0, on_work: 0, complete: 0, delivered: 0 }
    let sqm = 0
    let qty = 0
    for (const it of items) {
      counts[itemStatus(it)] += 1
      sqm += itemSqm(it)
      qty += itemQty(it)
    }
    return { count: items.length, qty, sqm, counts }
  }, [items])

  function toggle(idx: number): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function toggleAll(): void {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((_, i) => i))))
  }

  function setOneStatus(idx: number, status: OrderItemStatus): void {
    void persist(items.map((it, i) => (i === idx ? { ...it, status } : it)))
  }

  function setSelectedStatus(status: OrderItemStatus): void {
    void persist(items.map((it, i) => (selected.has(i) ? { ...it, status } : it)))
  }

  function assignSeller(seller: ClientListItem): void {
    setAssignOpen(false)
    // Handing a carpet to a weaver starts its work.
    void persist(
      items.map((it, i) =>
        selected.has(i)
          ? { ...it, sellerClientId: seller.id, sellerName: seller.name, status: 'on_work' as const }
          : it
      )
    )
  }

  if (!order) {
    return <div className="p-6 text-sm text-muted-foreground">{t('common.loading', 'Loading…')}</div>
  }

  const selCount = selected.size
  const allSelected = items.length > 0 && selCount === items.length

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} title={t('common.back', 'Back')}>
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">
              {order.orderNo ? `#${order.orderNo}` : t('orders.title', 'Order')}
            </h2>
            <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', orderStatusBadge(order.status))}>
              {orderStatusLabel(t, order.status)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {order.buyerName || t('common.none', '—')} · {formatDate(order.orderDate, calendar)}
          </p>
        </div>
      </div>

      {/* Statistics */}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label={t('orders.carpets', 'Carpets')} value={String(stats.count)} strong />
        <Stat label={t('orders.totalQty', 'Total qty')} value={String(stats.qty)} />
        <Stat label={t('orders.totalSqm', 'Total SQM')} value={stats.sqm.toFixed(2)} />
        {ORDER_ITEM_STATUSES.map((s) => (
          <Stat
            key={s}
            label={orderItemStatusLabel(t, s)}
            value={String(stats.counts[s])}
            badgeClass={orderItemStatusBadge(s)}
          />
        ))}
      </div>

      {/* Selection toolbar */}
      {selCount > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-accent/40 px-3 py-2">
          <span className="text-sm font-medium">
            {t('orders.selectedCount', { count: selCount, defaultValue: '{{count}} selected' })}
          </span>
          <Button size="sm" onClick={() => setAssignOpen(true)} disabled={busy}>
            <UserPlus className="h-4 w-4" />
            {t('orders.assignSeller', 'Assign to seller')}
          </Button>
          <span className="mx-1 text-xs text-muted-foreground">{t('orders.setStatus', 'Set status')}:</span>
          {(['on_work', 'complete', 'delivered'] as const).map((s) => (
            <Button key={s} variant="outline" size="sm" onClick={() => setSelectedStatus(s)} disabled={busy}>
              {orderItemStatusLabel(t, s)}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            <X className="h-4 w-4" />
            {t('common.clear', 'Clear')}
          </Button>
        </div>
      )}

      {/* Items table */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        <div className={cn(GRID, 'h-9 shrink-0 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground')}>
          <span className="flex items-center">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={allSelected}
              onChange={toggleAll}
              title={t('orders.selectAll', 'Select all')}
            />
          </span>
          <span className="text-center">{t('orders.rowNo', '#')}</span>
          <span>{t('orders.carpetType', 'Carpet type')}</span>
          <span className="text-end">{t('orders.dims', 'W×L')}</span>
          <span className="text-end">{t('orders.sqm', 'SQM')}</span>
          <span className="text-end">{t('orders.quantity', 'Qty')}</span>
          <span>{t('orders.seller', 'Seller')}</span>
          <span>{t('orders.itemStatusLabel', 'Status')}</span>
        </div>

        <div className="flex-1 overflow-auto">
          {items.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">{t('orders.noItems', 'No carpets in this order.')}</div>
          )}
          {items.map((it, i) => {
            const isSel = selected.has(i)
            return (
              <div
                key={i}
                className={cn(GRID, 'border-b border-border py-2 text-sm', isSel && 'bg-accent/30')}
              >
                <span className="flex items-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={isSel}
                    onChange={() => toggle(i)}
                  />
                </span>
                <span className="text-center text-muted-foreground">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{it.carpetType || t('common.none', '—')}</span>
                  {(it.graph || it.textColor || it.borderColor) && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {[it.graph, it.textColor, it.borderColor].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <span className="text-end font-mono tabular-nums text-muted-foreground">
                  {it.width != null && it.length != null ? `${it.width}×${it.length}` : '—'}
                </span>
                <span className="text-end font-mono tabular-nums">{it.sqm != null ? it.sqm.toFixed(2) : '—'}</span>
                <span className="text-end font-mono tabular-nums text-muted-foreground">{it.quantity}</span>
                <span className="truncate">
                  {it.sellerName || <span className="text-muted-foreground">{t('orders.unassigned', 'Unassigned')}</span>}
                </span>
                <span>
                  <select
                    value={itemStatus(it)}
                    onChange={(e) => setOneStatus(i, e.target.value as OrderItemStatus)}
                    disabled={busy}
                    className={cn(
                      'h-7 w-full rounded-md border-0 px-2 text-xs font-medium focus:ring-1 focus:ring-ring',
                      orderItemStatusBadge(itemStatus(it))
                    )}
                  >
                    {ORDER_ITEM_STATUSES.map((s) => (
                      <option key={s} value={s} className="bg-card text-foreground">
                        {orderItemStatusLabel(t, s)}
                      </option>
                    ))}
                  </select>
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <AssignSellerDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        count={selCount}
        onAssign={assignSeller}
      />
    </div>
  )
}

function Stat({
  label,
  value,
  strong,
  badgeClass
}: {
  label: string
  value: string
  strong?: boolean
  badgeClass?: string
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-card">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      {badgeClass ? (
        <span className={cn('mt-0.5 inline-block rounded-md px-2 py-0.5 font-mono text-sm font-semibold tabular-nums', badgeClass)}>
          {value}
        </span>
      ) : (
        <div className={cn('font-mono tabular-nums', strong && 'text-lg font-semibold')}>{value}</div>
      )}
    </div>
  )
}
