import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, CheckCircle2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { DateInput } from '@renderer/components/ui/date-input'
import { Typeahead } from '@renderer/components/ui/typeahead'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/store/settings'
import { formatDate, startOfDayEpoch } from '@renderer/lib/date'
import type { Currency } from '@shared/accounting'
import type { ClientListItem, OrderAssignment, OrderItem, OrderItemStatus } from '@shared/contracts'
import { orderItemStatusLabel, orderItemStatusBadge } from './orderStatus'
import { CompleteAssignmentDialog } from './CompleteAssignmentDialog'

const todayStr = (): string => new Date().toISOString().slice(0, 10)

let uidSeq = 0
const uid = (): string => `${Date.now().toString(36)}-${(uidSeq++).toString(36)}`

const ROW_GRID = 'grid grid-cols-[minmax(110px,1.5fr)_50px_112px_88px_minmax(128px,auto)] items-center gap-2'

/** Statuses that can still be completed (a done/delivered hand-off cannot). */
const canComplete = (s: OrderItemStatus): boolean => s === 'pending' || s === 'on_work'

/**
 * Apply a completion to the hand-off list: mark the whole hand-off «تکمیل» when
 * every piece was completed, or split it into a completed piece plus the
 * still-open remainder when only some pieces were finished.
 */
function applyCompletion(
  list: OrderAssignment[],
  id: string,
  completedQty: number
): OrderAssignment[] {
  const idx = list.findIndex((a) => a.id === id)
  if (idx < 0 || completedQty <= 0) return list
  const a = list[idx]
  if (completedQty >= a.quantity) {
    return list.map((x) => (x.id === id ? { ...x, status: 'complete' } : x))
  }
  const remaining: OrderAssignment = { ...a, quantity: a.quantity - completedQty }
  const done: OrderAssignment = { ...a, id: uid(), quantity: completedQty, status: 'complete' }
  const next = [...list]
  next.splice(idx, 1, remaining, done)
  return next
}

/**
 * Manage the بافنده hand-offs of a single carpet item: split its quantity across
 * several weavers (each with a date). A hand-off's status is not edited by hand —
 * it advances to «تکمیل» through the Complete action, which turns the finished
 * pieces into warehouse carpets and posts their cost to the بافنده's account.
 * Add/remove edits are staged locally and saved on «ذخیره»; a completion is a
 * real ledger posting, so it is committed to the order immediately.
 */
export function ItemAssignmentsDialog({
  open,
  onOpenChange,
  item,
  currency,
  onSave,
  onCommit
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: OrderItem | null
  currency: Currency
  onSave: (assignments: OrderAssignment[]) => void
  /** Persist immediately without closing (used after a completion posts). */
  onCommit: (assignments: OrderAssignment[]) => void
}): JSX.Element {
  const { t } = useTranslation()
  const { calendar } = useSettings()

  const [sellers, setSellers] = useState<ClientListItem[]>([])
  const [list, setList] = useState<OrderAssignment[]>([])
  // Add-row fields.
  const [query, setQuery] = useState('')
  const [seller, setSeller] = useState<ClientListItem | null>(null)
  const [qty, setQty] = useState('')
  const [date, setDate] = useState(todayStr())
  const [error, setError] = useState<string | null>(null)
  // The hand-off currently being completed (null = complete dialog closed).
  const [completing, setCompleting] = useState<OrderAssignment | null>(null)

  useEffect(() => {
    if (!open || !item) return
    setList(item.assignments ?? [])
    setQuery('')
    setSeller(null)
    setDate(todayStr())
    setError(null)
    void window.api.clients
      .list({ kind: 'seller', includeArchived: false, limit: 1000, offset: 0 })
      .then((r) => setSellers(r.rows))
  }, [open, item])

  const total = item?.quantity ?? 0
  const assigned = useMemo(() => list.reduce((s, a) => s + (a.quantity > 0 ? a.quantity : 0), 0), [list])
  const remaining = Math.max(0, total - assigned)

  // Default the add-row quantity to whatever is still unassigned.
  useEffect(() => {
    setQty(remaining > 0 ? String(remaining) : '')
  }, [remaining, open])

  const sellerItems = useMemo(
    () => sellers.map((s) => ({ id: s.id, label: s.name, sublabel: s.phone ?? undefined })),
    [sellers]
  )

  function addAssignment(): void {
    setError(null)
    if (!seller) return setError(t('orders.sellerRequired', 'Choose a بافنده.'))
    const n = parseInt(qty, 10)
    if (!Number.isFinite(n) || n <= 0) return setError(t('orders.qtyRequired', 'Enter a quantity.'))
    if (n > remaining) return setError(t('orders.qtyTooBig', { remaining, defaultValue: 'Only {{remaining}} left to assign.' }))
    setList((prev) => [
      ...prev,
      {
        id: uid(),
        sellerClientId: seller.id,
        sellerName: seller.name,
        quantity: n,
        assignedDate: startOfDayEpoch(date) ?? Date.now(),
        status: 'pending'
      }
    ])
    setSeller(null)
    setQuery('')
  }

  function remove(id: string): void {
    setList((prev) => prev.filter((a) => a.id !== id))
  }

  // A completion already posted carpets + the بافنده's purchase, so commit the
  // resulting status change to the order right away (don't wait for «ذخیره»).
  function handleCompleted(id: string, completedQty: number): void {
    setList((prev) => {
      const next = applyCompletion(prev, id, completedQty)
      onCommit(next)
      return next
    })
  }

  if (!item) return <Dialog open={open} onOpenChange={onOpenChange} />

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t('orders.assignmentsTitle', 'Assignments')} — {item.carpetType || t('common.none', '—')}
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <Mini label={t('orders.quantity', 'Qty')} value={String(total)} />
          <Mini label={t('orders.assigned', 'Assigned')} value={String(assigned)} />
          <Mini label={t('orders.remaining', 'Remaining')} value={String(remaining)} strong={remaining > 0} />
        </div>

        {/* Existing assignments */}
        <div className="rounded-xl border border-border/70">
          <div className={cn(ROW_GRID, 'border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground')}>
            <span>{t('orders.seller', 'بافنده')}</span>
            <span className="text-end">{t('orders.quantity', 'Qty')}</span>
            <span>{t('orders.assignedDate', 'Given on')}</span>
            <span>{t('orders.itemStatusLabel', 'Status')}</span>
            <span />
          </div>
          {list.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              {t('orders.noAssignments', 'Not handed to any بافنده yet.')}
            </div>
          )}
          {list.map((a) => (
            <div key={a.id} className={cn(ROW_GRID, 'border-b border-border px-3 py-2 text-sm last:border-b-0')}>
              <span className="truncate">{a.sellerName || t('common.none', '—')}</span>
              <span className="text-end font-mono tabular-nums">{a.quantity}</span>
              <span className="text-muted-foreground">{formatDate(a.assignedDate, calendar)}</span>
              <span>
                <span
                  className={cn(
                    'inline-block rounded-md px-2 py-0.5 text-xs font-medium',
                    orderItemStatusBadge(a.status)
                  )}
                >
                  {orderItemStatusLabel(t, a.status)}
                </span>
              </span>
              <span className="flex items-center justify-end gap-1">
                {canComplete(a.status) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    title={t('complete.button', 'Complete')}
                    onClick={() => setCompleting(a)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t('complete.button', 'Complete')}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  title={t('common.delete', 'Delete')}
                  aria-label={t('common.delete', 'Delete')}
                  onClick={() => remove(a.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </span>
            </div>
          ))}
        </div>

        {/* Add a new hand-off */}
        {remaining > 0 && (
          <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
            <div className="text-xs font-medium text-muted-foreground">{t('orders.addAssignment', 'Hand off to a بافنده')}</div>
            {/* flex-wrap so the multi-select Shamsi date picker keeps its full
                width (day/month/year + toggle) instead of being squeezed. */}
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[150px] flex-1 space-y-1">
                <span className="text-xs text-muted-foreground">{t('orders.seller', 'بافنده')}</span>
                <Typeahead
                  value={query}
                  onValueChange={(v) => {
                    setQuery(v)
                    setSeller(null)
                  }}
                  items={sellerItems}
                  onSelect={(it) => {
                    const s = sellers.find((x) => x.id === it.id) ?? null
                    setSeller(s)
                    setQuery(s?.name ?? '')
                  }}
                  placeholder={t('orders.sellerPlaceholder', 'Type a بافنده name…')}
                />
              </label>
              <label className="w-16 space-y-1">
                <span className="text-xs text-muted-foreground">{t('orders.quantity', 'Qty')}</span>
                <Input
                  type="number"
                  min="1"
                  max={String(remaining)}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addAssignment()}
                  className="h-9 text-end"
                />
              </label>
              <label className="min-w-[240px] flex-1 space-y-1">
                <span className="text-xs text-muted-foreground">{t('orders.assignedDate', 'Given on')}</span>
                <DateInput value={date} onChange={setDate} className="h-9" />
              </label>
              <Button onClick={addAssignment} className="h-9">
                <Plus className="h-4 w-4" />
                {t('orders.assign', 'Assign')}
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => onSave(list)}>{t('common.save', 'Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <CompleteAssignmentDialog
      open={completing !== null}
      onOpenChange={(o) => !o && setCompleting(null)}
      assignment={completing}
      item={item}
      currency={currency}
      onCompleted={(qty) => completing && handleCompleted(completing.id, qty)}
    />
    </>
  )
}

function Mini({ label, value, strong }: { label: string; value: string; strong?: boolean }): JSX.Element {
  return (
    <div className="rounded-lg border border-border/70 bg-card p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('font-mono text-lg tabular-nums', strong && 'font-semibold text-amber-600 dark:text-amber-400')}>
        {value}
      </div>
    </div>
  )
}
