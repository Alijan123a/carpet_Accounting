import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
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
import { ORDER_ITEM_STATUSES } from '@shared/contracts'
import type { ClientListItem, OrderAssignment, OrderItem, OrderItemStatus } from '@shared/contracts'
import { orderItemStatusLabel, orderItemStatusBadge } from './orderStatus'

const todayStr = (): string => new Date().toISOString().slice(0, 10)

let uidSeq = 0
const uid = (): string => `${Date.now().toString(36)}-${(uidSeq++).toString(36)}`

const ROW_GRID = 'grid grid-cols-[minmax(110px,1.5fr)_56px_118px_128px_36px] items-center gap-2'

/**
 * Manage the بافنده hand-offs of a single carpet item: split its quantity across
 * several weavers (each with a date), and set each hand-off's status manually.
 * Edits are staged locally and persisted once the user saves.
 */
export function ItemAssignmentsDialog({
  open,
  onOpenChange,
  item,
  onSave
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: OrderItem | null
  onSave: (assignments: OrderAssignment[]) => void
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

  function setStatus(id: string, status: OrderItemStatus): void {
    setList((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))
  }

  function remove(id: string): void {
    setList((prev) => prev.filter((a) => a.id !== id))
  }

  if (!item) return <Dialog open={open} onOpenChange={onOpenChange} />

  return (
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
                <select
                  value={a.status}
                  onChange={(e) => setStatus(a.id, e.target.value as OrderItemStatus)}
                  className={cn(
                    'h-7 w-full rounded-md border-0 px-2 text-xs font-medium focus:ring-1 focus:ring-ring',
                    orderItemStatusBadge(a.status)
                  )}
                >
                  {ORDER_ITEM_STATUSES.map((s) => (
                    <option key={s} value={s} className="bg-card text-foreground">
                      {orderItemStatusLabel(t, s)}
                    </option>
                  ))}
                </select>
              </span>
              <span className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  title={t('common.delete', 'Delete')}
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
            <div className="grid grid-cols-[minmax(120px,1.6fr)_72px_130px_auto] items-end gap-2">
              <label className="space-y-1">
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
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">{t('orders.quantity', 'Qty')}</span>
                <Input
                  type="number"
                  min="1"
                  max={String(remaining)}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="h-9 text-end"
                />
              </label>
              <label className="space-y-1">
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

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => onSave(list)}>{t('common.save', 'Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
