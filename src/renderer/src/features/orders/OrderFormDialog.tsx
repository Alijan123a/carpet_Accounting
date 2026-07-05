import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Typeahead } from '@renderer/components/ui/typeahead'
import { useSettings } from '@renderer/store/settings'
import { startOfDayEpoch } from '@renderer/lib/date'
import { parseMoneyToCents, centsToInput, ENABLED_CURRENCIES } from '@shared/accounting'
import type { Currency } from '@shared/accounting'
import { ORDER_STATUSES } from '@shared/contracts'
import type { ClientListItem, OrderStatus, OrderView } from '@shared/contracts'
import { orderStatusLabel } from './orderStatus'

const todayStr = (): string => new Date().toISOString().slice(0, 10)
const toDateInput = (epoch: number): string => new Date(epoch).toISOString().slice(0, 10)

export function OrderFormDialog({
  open,
  onOpenChange,
  order,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  order?: OrderView | null
  onSaved: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const defaultCurrency = useSettings((s) => s.defaultCurrency)

  const [buyers, setBuyers] = useState<ClientListItem[]>([])
  const [buyerQuery, setBuyerQuery] = useState('')
  const [buyer, setBuyer] = useState<ClientListItem | null>(null)
  const [title, setTitle] = useState('')
  const [quality, setQuality] = useState('')
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState<Currency>(defaultCurrency)
  const [status, setStatus] = useState<OrderStatus>('pending')
  const [orderDate, setOrderDate] = useState(todayStr())
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setBuyer(null)
    setBuyerQuery(order?.buyerName ?? '')
    setTitle(order?.title ?? '')
    setQuality(order?.quality ?? '')
    setLength(order?.length != null ? String(order.length) : '')
    setWidth(order?.width != null ? String(order.width) : '')
    setQuantity(order ? String(order.quantity) : '1')
    setPrice(order ? centsToInput(order.priceCents) : '')
    setCurrency(order?.currency ?? defaultCurrency)
    setStatus(order?.status ?? 'pending')
    setOrderDate(order ? toDateInput(order.orderDate) : todayStr())
    setDueDate(order?.dueDate ? toDateInput(order.dueDate) : '')
    setNotes(order?.notes ?? '')
    void window.api.clients
      .list({ kind: 'buyer', includeArchived: false, limit: 1000, offset: 0 })
      .then((r) => {
        setBuyers(r.rows)
        // Re-bind the existing buyer object when editing.
        if (order) setBuyer(r.rows.find((c) => c.id === order.buyerClientId) ?? null)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order])

  const buyerItems = useMemo(
    () => buyers.map((b) => ({ id: b.id, label: b.name, sublabel: b.phone ?? undefined })),
    [buyers]
  )

  async function submit(): Promise<void> {
    if (!buyer) return setError(t('orders.buyerRequired', 'Choose a buyer.'))
    if (!title.trim()) return setError(t('orders.titleRequired', 'Describe the ordered carpet.'))

    setBusy(true)
    setError(null)
    try {
      const payload = {
        buyerClientId: buyer.id,
        title: title.trim(),
        quality: quality.trim() || null,
        length: parseFloat(length) || null,
        width: parseFloat(width) || null,
        quantity: parseInt(quantity, 10) || 1,
        priceCents: parseMoneyToCents(price) ?? 0,
        currency,
        status,
        orderDate: startOfDayEpoch(orderDate) ?? Date.now(),
        dueDate: dueDate ? startOfDayEpoch(dueDate) : null,
        notes: notes.trim() || null
      }
      if (order) await window.api.orders.update(order.id, payload)
      else await window.api.orders.create(payload)
      onSaved()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{order ? t('orders.edit', 'Edit order') : t('orders.add', 'New order')}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('orders.buyer', 'Buyer')}</span>
            <Typeahead
              value={buyerQuery}
              onValueChange={(v) => {
                setBuyerQuery(v)
                setBuyer(null)
              }}
              items={buyerItems}
              onSelect={(it) => {
                const b = buyers.find((x) => x.id === it.id) ?? null
                setBuyer(b)
                setBuyerQuery(b?.name ?? '')
              }}
              placeholder={t('invoice.buyerPlaceholder', 'Type a buyer name…')}
            />
          </label>

          <label className="col-span-2 block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('orders.titleField', 'Ordered carpet')}</span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('orders.titlePlaceholder', 'e.g. 3×4 Herati design, red')}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('carpets.quality', 'Quality')}</span>
            <Input value={quality} onChange={(e) => setQuality(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('orders.quantity', 'Quantity')}</span>
            <Input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{`${t('carpets.length', 'Length')} (m)`}</span>
            <Input type="number" step="0.01" value={length} onChange={(e) => setLength(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{`${t('carpets.width', 'Width')} (m)`}</span>
            <Input type="number" step="0.01" value={width} onChange={(e) => setWidth(e.target.value)} />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('orders.price', 'Agreed price')}</span>
            <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('carpets.currency', 'Currency')}</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className="h-10 w-full rounded-lg border border-input bg-card shadow-soft px-3 text-sm"
            >
              {ENABLED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('orders.status.label', 'Status')}</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus)}
              className="h-10 w-full rounded-lg border border-input bg-card shadow-soft px-3 text-sm"
            >
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {orderStatusLabel(t, s)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('orders.orderDate', 'Order date')}</span>
            <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('orders.dueDate', 'Due date')}</span>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('orders.notes', 'Notes')}</span>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
