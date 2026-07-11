import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Hash, User, CalendarDays } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { toast } from '@renderer/components/ui/toast'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/store/settings'
import { formatDate } from '@renderer/lib/date'
import { ORDER_ITEM_STATUSES } from '@shared/contracts'
import type { OrderAssignment, OrderItem, OrderItemStatus, OrderView } from '@shared/contracts'
import {
  orderStatusLabel,
  orderStatusBadge,
  orderItemStatusLabel,
  orderItemStatusBadge,
  orderItemStatusText,
  statusCounts
} from './orderStatus'
import { ItemAssignmentsDialog } from './ItemAssignmentsDialog'

// # | carpet type | W×L | SQM | Qty | one column per item status (piece count)
const GRID =
  'grid grid-cols-[40px_minmax(150px,1.4fr)_96px_72px_52px_repeat(4,minmax(56px,0.8fr))] items-center gap-0 px-3 [&>*]:border-e [&>*]:border-border [&>*:last-child]:border-e-0 [&>*]:px-2 [&>*]:!text-center [&>*]:!justify-center'

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
  const [editIndex, setEditIndex] = useState<number | null>(null)

  const load = useCallback(async (): Promise<void> => {
    const o = await window.api.orders.get(orderId)
    setOrder(o)
    setItems(o?.items ?? [])
  }, [orderId])

  useEffect(() => {
    void load()
  }, [load])

  const persist = useCallback(
    async (next: OrderItem[]): Promise<void> => {
      setItems(next)
      try {
        await window.api.orders.updateItems(orderId, next)
        toast.success(t('common.saved', 'Saved.'))
        onChanged()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('common.error', 'An error occurred.'))
        void load() // re-sync the optimistic list with the stored state
      }
    },
    [orderId, onChanged, t, load]
  )

  function saveAssignments(index: number, assignments: OrderAssignment[]): void {
    setEditIndex(null)
    void persist(items.map((it, i) => (i === index ? { ...it, assignments } : it)))
  }

  const stats = useMemo(() => {
    const counts: Record<OrderItemStatus, number> = { pending: 0, on_work: 0, complete: 0, delivered: 0 }
    let sqm = 0
    let qty = 0
    for (const it of items) {
      const c = statusCounts(it)
      for (const s of ORDER_ITEM_STATUSES) counts[s] += c[s]
      sqm += it.sqm ?? 0
      qty += it.quantity > 0 ? it.quantity : 0
    }
    return { count: items.length, qty, sqm, counts }
  }, [items])

  if (!order) {
    return <div className="p-6 text-sm text-muted-foreground">{t('common.loading', 'Loading…')}</div>
  }

  return (
    <div className="flex h-full flex-col">
      {/* Professional header card */}
      <div className="mb-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          title={t('common.back', 'Back')}
          aria-label={t('common.back', 'Back')}
        >
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <div className="flex flex-1 flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border border-border/70 bg-card px-5 py-3.5 shadow-card">
          <HeaderField icon={<Hash className="h-4 w-4" />} label={t('orders.orderNo', 'Order #')}>
            <span className="text-xl font-bold tracking-tight">{order.orderNo || `#${order.id}`}</span>
          </HeaderField>
          <HeaderField icon={<User className="h-4 w-4" />} label={t('orders.buyer', 'Buyer')}>
            <span className="font-medium">{order.buyerName || t('common.none', '—')}</span>
          </HeaderField>
          <HeaderField icon={<CalendarDays className="h-4 w-4" />} label={t('orders.orderDate', 'Order date')}>
            <span className="font-mono tabular-nums">{formatDate(order.orderDate, calendar)}</span>
          </HeaderField>
          <span
            className={cn(
              'ms-auto rounded-lg px-3 py-1 text-sm font-medium',
              orderStatusBadge(order.status)
            )}
          >
            {orderStatusLabel(t, order.status)}
          </span>
        </div>
      </div>

      {/* Statistics (piece counts) */}
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

      {/* Items */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        <div className={cn(GRID, 'h-9 shrink-0 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground')}>
          <span>{t('orders.rowNo', '#')}</span>
          <span>{t('orders.carpetType', 'Carpet type')}</span>
          <span>{t('orders.dims', 'W×L')}</span>
          <span>{t('orders.sqm', 'SQM')}</span>
          <span>{t('orders.quantity', 'Qty')}</span>
          {/* One column per carpet status showing that item's piece count. */}
          {ORDER_ITEM_STATUSES.map((s) => (
            <span key={s} className="truncate" title={orderItemStatusLabel(t, s)}>
              {orderItemStatusLabel(t, s)}
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          {items.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">{t('orders.noItems', 'No carpets in this order.')}</div>
          )}
          {items.map((it, i) => {
            const counts = statusCounts(it)
            return (
              <div
                key={i}
                onDoubleClick={() => setEditIndex(i)}
                title={t('orders.itemOpenHint', 'Double-click to manage بافنده assignments')}
                className={cn(GRID, 'cursor-pointer border-b border-border py-2 text-sm hover:bg-accent/40')}
              >
                <span className="text-muted-foreground">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{it.carpetType || t('common.none', '—')}</span>
                  {(it.graph || it.textColor || it.borderColor) && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {[it.graph, it.textColor, it.borderColor].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {it.width != null && it.length != null ? `${it.width}×${it.length}` : t('common.none', '—')}
                </span>
                <span className="font-mono tabular-nums">{it.sqm != null ? it.sqm.toFixed(2) : t('common.none', '—')}</span>
                <span className="font-mono tabular-nums text-muted-foreground">{it.quantity}</span>
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
      </div>

      <ItemAssignmentsDialog
        open={editIndex !== null}
        onOpenChange={(o) => !o && setEditIndex(null)}
        item={editIndex !== null ? items[editIndex] : null}
        currency={order.currency}
        onSave={(assignments) => editIndex !== null && saveAssignments(editIndex, assignments)}
        onCommit={(assignments) => {
          if (editIndex !== null) {
            void persist(items.map((it, i) => (i === editIndex ? { ...it, assignments } : it)))
          }
        }}
      />
    </div>
  )
}

function HeaderField({
  icon,
  label,
  children
}: {
  icon: JSX.Element
  label: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-muted-foreground">{icon}</span>
      <div className="leading-tight">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        {children}
      </div>
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
