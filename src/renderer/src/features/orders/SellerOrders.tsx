import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/store/settings'
import { formatDate } from '@renderer/lib/date'
import type { OrderItemStatus, SellerAssignmentView } from '@shared/contracts'
import { orderItemStatusLabel, orderItemStatusBadge } from './orderStatus'

const GRID =
  'grid grid-cols-[64px_minmax(100px,1.1fr)_minmax(120px,1.4fr)_92px_66px_46px_116px_120px] items-center gap-0 px-3 [&>*]:border-e [&>*]:border-border [&>*:last-child]:border-e-0 [&>*]:px-2 [&>*]:!text-center [&>*]:!justify-center'

/** Carpets a single بافنده has been handed, flattened across every order. */
export function SellerOrders({
  clientId,
  clientName,
  onBack
}: {
  clientId: number
  clientName: string
  onBack: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const { calendar } = useSettings()
  const [rows, setRows] = useState<SellerAssignmentView[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setRows(await window.api.orders.assignedToSeller(clientId))
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    void load()
  }, [load])

  const stats = useMemo(() => {
    const counts: Record<OrderItemStatus, number> = { pending: 0, on_work: 0, complete: 0, delivered: 0 }
    let qty = 0
    for (const r of rows) {
      counts[r.status] += r.quantity
      qty += r.quantity
    }
    return { carpets: rows.length, qty, counts }
  }, [rows])

  return (
    <div className="flex h-full flex-col">
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
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('orders.sellerOrdersTitle', 'Assigned carpets')}</h2>
          <p className="text-sm text-muted-foreground">{clientName}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={t('orders.carpets', 'Carpets')} value={String(stats.carpets)} strong />
        <Stat label={t('orders.totalQty', 'Total qty')} value={String(stats.qty)} />
        {(['on_work', 'complete', 'delivered', 'pending'] as const).map((s) => (
          <Stat key={s} label={orderItemStatusLabel(t, s)} value={String(stats.counts[s])} badgeClass={orderItemStatusBadge(s)} />
        ))}
      </div>

      {/* Table */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        <div className={cn(GRID, 'h-9 shrink-0 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground')}>
          <span>{t('orders.orderNo', 'Order #')}</span>
          <span>{t('orders.buyer', 'Buyer')}</span>
          <span>{t('orders.carpetType', 'Carpet type')}</span>
          <span className="text-end">{t('orders.dims', 'W×L')}</span>
          <span className="text-end">{t('orders.sqm', 'SQM')}</span>
          <span className="text-end">{t('orders.quantity', 'Qty')}</span>
          <span>{t('orders.assignedDate', 'Given on')}</span>
          <span>{t('orders.itemStatusLabel', 'Status')}</span>
        </div>
        <div className="flex-1 overflow-auto">
          {!loading && rows.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {t('orders.noSellerOrders', 'No carpets have been assigned to this بافنده yet.')}
            </div>
          )}
          {rows.map((r) => (
            <div key={`${r.orderId}-${r.itemIndex}-${r.assignmentId}`} className={cn(GRID, 'border-b border-border py-2 text-sm')}>
              <span className="font-mono tabular-nums">{r.orderNo || `#${r.orderId}`}</span>
              <span className="truncate">{r.buyerName || t('common.none', '—')}</span>
              <span className="truncate">
                <span className="block truncate font-medium">{r.carpetType || t('common.none', '—')}</span>
                {r.graph && <span className="block truncate text-xs text-muted-foreground">{r.graph}</span>}
              </span>
              <span className="text-end font-mono tabular-nums text-muted-foreground">
                {r.width != null && r.length != null ? `${r.width}×${r.length}` : '—'}
              </span>
              <span className="text-end font-mono tabular-nums">{r.sqm != null ? r.sqm.toFixed(2) : '—'}</span>
              <span className="text-end font-mono tabular-nums">{r.quantity}</span>
              <span className="text-muted-foreground">{formatDate(r.assignedDate, calendar)}</span>
              <span>
                <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', orderItemStatusBadge(r.status))}>
                  {orderItemStatusLabel(t, r.status)}
                </span>
              </span>
            </div>
          ))}
          {loading && <div className="p-3 text-center text-xs text-muted-foreground">{t('common.loading', 'Loading…')}</div>}
        </div>
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
