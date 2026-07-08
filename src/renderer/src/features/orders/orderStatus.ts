import type { TFunction } from 'i18next'
import type { OrderStatus, OrderItemStatus } from '@shared/contracts'

/** Localized label for an order status (falls back to English). */
export function orderStatusLabel(t: TFunction, status: OrderStatus): string {
  const fallback: Record<OrderStatus, string> = {
    pending: 'Pending',
    on_work: 'On work',
    finished: 'Finished',
    delivered: 'Delivered',
    cancelled: 'Cancelled'
  }
  return t(`orders.status.${status}`, fallback[status])
}

/** Tailwind classes for a status badge (background + text), theme-aware. */
export function orderStatusBadge(status: OrderStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
    case 'on_work':
      return 'bg-sky-500/15 text-sky-700 dark:text-sky-400'
    case 'finished':
      return 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400'
    case 'delivered':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
    case 'cancelled':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

/** Localized label for a per-carpet (item) status. */
export function orderItemStatusLabel(t: TFunction, status: OrderItemStatus): string {
  const fallback: Record<OrderItemStatus, string> = {
    pending: 'Pending',
    on_work: 'On work',
    complete: 'Complete',
    delivered: 'Delivered'
  }
  return t(`orders.itemStatus.${status}`, fallback[status])
}

/** Tailwind classes for a per-carpet status badge (background + text). */
export function orderItemStatusBadge(status: OrderItemStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
    case 'on_work':
      return 'bg-sky-500/15 text-sky-700 dark:text-sky-400'
    case 'complete':
      return 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400'
    case 'delivered':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}
