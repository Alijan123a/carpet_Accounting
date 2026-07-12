import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/store/settings'
import { formatDate } from '@renderer/lib/date'
import type { OrderItem, OrderItemStatus } from '@shared/contracts'
import { orderItemStatusLabel, orderItemStatusBadge, assignedQuantity } from './orderStatus'

// # | carpet type | W×L | SQM | qty | بافنده | given on
const GRID =
  'grid grid-cols-[36px_minmax(140px,1.4fr)_88px_72px_56px_minmax(110px,1fr)_112px] items-center gap-0 px-3 [&>*]:border-e [&>*]:border-border [&>*:last-child]:border-e-0 [&>*]:px-2 [&>*]:!text-center [&>*]:!justify-center'

/** One displayed row: some pieces of an item in the dialog's status. */
interface PieceRow {
  itemIndex: number
  item: OrderItem
  quantity: number
  /** null for the unassigned (pending) remainder — no بافنده yet. */
  sellerName: string | null
  date: number | null
}

/**
 * Pieces of an order currently in `status`. Assigned pieces come from the
 * hand-offs (each with its بافنده and date); the pending view instead lists
 * every item's still-unassigned remainder (no بافنده by definition).
 */
function pieceRows(items: OrderItem[], status: OrderItemStatus): PieceRow[] {
  const rows: PieceRow[] = []
  items.forEach((item, itemIndex) => {
    if (status === 'pending') {
      const remaining = item.quantity - assignedQuantity(item)
      if (remaining > 0) rows.push({ itemIndex, item, quantity: remaining, sellerName: null, date: null })
      return
    }
    for (const a of item.assignments ?? []) {
      if (a.status === status && a.quantity > 0) {
        rows.push({ itemIndex, item, quantity: a.quantity, sellerName: a.sellerName || null, date: a.assignedDate })
      }
    }
  })
  return rows
}

/**
 * Read-only popup behind the OrderDetail status statistics: double-clicking
 * e.g. «در حال کار: ۱۳» lists those 13 pieces with their carpet details, the
 * بافنده they are with, and the hand-off date.
 */
export function StatusPiecesDialog({
  status,
  items,
  onClose
}: {
  /** null = closed. */
  status: OrderItemStatus | null
  items: OrderItem[]
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const { calendar } = useSettings()

  const rows = useMemo(() => (status ? pieceRows(items, status) : []), [items, status])
  const totalPieces = rows.reduce((s, r) => s + r.quantity, 0)

  return (
    <Dialog open={status !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {status && (
              <span className={cn('rounded-md px-2 py-0.5 text-sm font-medium', orderItemStatusBadge(status))}>
                {orderItemStatusLabel(t, status)}
              </span>
            )}
            <span className="text-sm font-normal text-muted-foreground">
              {t('orders.piecesCount', { count: totalPieces, defaultValue: '{{count}} piece(s)' })}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-hidden rounded-xl border border-border/70">
          <div className={cn(GRID, 'border-b border-border bg-muted/40 py-2 text-xs font-medium text-muted-foreground')}>
            <span>{t('orders.rowNo', '#')}</span>
            <span>{t('orders.carpetType', 'Carpet type')}</span>
            <span>{t('orders.dims', 'W×L')}</span>
            <span>{t('orders.sqm', 'SQM')}</span>
            <span>{t('orders.quantity', 'Qty')}</span>
            <span>{t('orders.seller', 'بافنده')}</span>
            <span>{t('orders.assignedDate', 'Given on')}</span>
          </div>

          <div className="max-h-[55vh] overflow-y-auto">
            {rows.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {t('orders.noPiecesInStatus', 'No pieces in this status.')}
              </div>
            )}
            {rows.map((r, i) => (
              <div key={i} className={cn(GRID, 'border-b border-border py-2 text-sm last:border-b-0')}>
                <span className="text-muted-foreground">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.item.carpetType || t('common.none', '—')}</span>
                  {(r.item.graph || r.item.textColor || r.item.borderColor) && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {[r.item.graph, r.item.textColor, r.item.borderColor].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {r.item.width != null && r.item.length != null
                    ? `${r.item.width}×${r.item.length}`
                    : t('common.none', '—')}
                </span>
                <span className="font-mono tabular-nums">
                  {r.item.sqm != null ? r.item.sqm.toFixed(2) : t('common.none', '—')}
                </span>
                <span className="font-mono font-semibold tabular-nums">{r.quantity}</span>
                <span className="truncate">{r.sellerName ?? t('common.none', '—')}</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {r.date != null ? formatDate(r.date, calendar) : t('common.none', '—')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
