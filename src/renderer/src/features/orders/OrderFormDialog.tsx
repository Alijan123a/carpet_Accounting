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
import { RequiredMark } from '@renderer/components/ui/required-mark'
import { toast } from '@renderer/components/ui/toast'
import { DateInput } from '@renderer/components/ui/date-input'
import { Typeahead } from '@renderer/components/ui/typeahead'
import { useSettings } from '@renderer/store/settings'
import { startOfDayEpoch } from '@renderer/lib/date'
import type { ClientListItem, OrderAssignment, OrderItem, OrderView } from '@shared/contracts'

const todayStr = (): string => new Date().toISOString().slice(0, 10)
const toDateInput = (epoch: number): string => new Date(epoch).toISOString().slice(0, 10)

/** Trim float noise on a computed SQM before showing it in the input. */
const round4 = (n: number): number => Math.round(n * 10000) / 10000

/** One editable row of the order table (raw input strings). */
interface Row {
  key: number
  carpetType: string
  graph: string
  width: string
  length: string
  sqm: string
  /** Sticky flag: once the user edits متراژ, stop auto-deriving it from W×L. */
  sqmManual: boolean
  textColor: string
  borderColor: string
  quantity: string
  description: string
  /** Preserved (not edited in this form) so بافنده hand-offs survive an edit. */
  assignments: OrderAssignment[]
}

let rowSeq = 1
function emptyRow(): Row {
  return {
    key: rowSeq++,
    carpetType: '',
    graph: '',
    width: '',
    length: '',
    sqm: '',
    sqmManual: false,
    textColor: '',
    borderColor: '',
    quantity: '1',
    description: '',
    assignments: []
  }
}

function itemToRow(it: OrderItem): Row {
  return {
    key: rowSeq++,
    carpetType: it.carpetType,
    graph: it.graph,
    width: it.width != null ? String(it.width) : '',
    length: it.length != null ? String(it.length) : '',
    sqm: it.sqm != null ? String(it.sqm) : '',
    // A stored SQM that differs from W×L was a manual override; keep it sticky.
    sqmManual: it.sqm != null && (it.width == null || it.length == null || round4(it.width * it.length) !== it.sqm),
    textColor: it.textColor,
    borderColor: it.borderColor,
    quantity: String(it.quantity),
    description: it.description,
    assignments: it.assignments ?? []
  }
}

/** Re-sync the auto-derived متراژ after any edit, unless it is sticky. */
function normalize(row: Row): Row {
  if (row.sqmManual) return row
  const w = parseFloat(row.width) || 0
  const l = parseFloat(row.length) || 0
  return { ...row, sqm: w > 0 && l > 0 ? String(round4(w * l)) : '' }
}

const rowSqm = (r: Row): number => parseFloat(r.sqm) || 0
const rowQty = (r: Row): number => parseInt(r.quantity, 10) || 0

/** A row counts toward the order if any of its content fields is filled in. */
function rowHasContent(r: Row): boolean {
  return Boolean(
    r.carpetType.trim() ||
      r.graph.trim() ||
      r.textColor.trim() ||
      r.borderColor.trim() ||
      r.description.trim() ||
      rowSqm(r) > 0
  )
}

// Table layout — column order mirrors the paper order sheet:
// # | نوع قالین | گراف | عرض | طول | متراژ | رنگ متن | رنگ حاشیه | تعداد | تفصیل | حذف
const TABLE_GRID =
  'grid grid-cols-[32px_minmax(110px,1.2fr)_minmax(90px,1fr)_88px_88px_96px_minmax(90px,1fr)_minmax(90px,1fr)_64px_minmax(120px,1.4fr)_40px] items-center gap-2'

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
  const [orderNo, setOrderNo] = useState('')
  const [orderDate, setOrderDate] = useState(todayStr())
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setBuyer(null)
    setBuyerQuery(order?.buyerName ?? '')
    setOrderDate(order ? toDateInput(order.orderDate) : todayStr())
    if (order) {
      setOrderNo(order.orderNo ?? '')
      // Legacy single-line orders (no items snapshot) become one editable row.
      setRows(
        order.items.length
          ? order.items.map(itemToRow)
          : [
              normalize({
                ...emptyRow(),
                carpetType: order.title,
                width: order.width != null ? String(order.width) : '',
                length: order.length != null ? String(order.length) : '',
                quantity: String(order.quantity),
                description: order.notes ?? ''
              })
            ]
      )
    } else {
      setOrderNo('')
      setRows([emptyRow()])
      void window.api.orders.nextOrderNo().then(setOrderNo)
    }
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

  const totalSqm = useMemo(() => round4(rows.reduce((s, r) => s + rowSqm(r), 0)), [rows])
  const totalQty = useMemo(() => rows.reduce((s, r) => s + rowQty(r), 0), [rows])

  function patch(key: number, updater: (r: Row) => Row): void {
    setRows((prev) => prev.map((r) => (r.key === key ? normalize(updater(r)) : r)))
  }

  function addRow(): void {
    setRows((prev) => [...prev, emptyRow()])
  }

  function removeRow(key: number): void {
    setRows((prev) => {
      const next = prev.filter((r) => r.key !== key)
      return next.length ? next : [emptyRow()]
    })
  }

  async function submit(): Promise<void> {
    if (!buyer) return setError(t('orders.buyerRequired', 'Choose a buyer.'))
    const filled = rows.filter(rowHasContent)
    if (!filled.length) return setError(t('orders.itemsRequired', 'Add at least one item.'))

    const items: OrderItem[] = filled.map((r) => ({
      carpetType: r.carpetType.trim(),
      graph: r.graph.trim(),
      width: parseFloat(r.width) || null,
      length: parseFloat(r.length) || null,
      sqm: rowSqm(r) || null,
      textColor: r.textColor.trim(),
      borderColor: r.borderColor.trim(),
      quantity: rowQty(r) || 1,
      description: r.description.trim(),
      assignments: r.assignments
    }))

    setBusy(true)
    setError(null)
    try {
      const no = orderNo.trim()
      const payload = {
        buyerClientId: buyer.id,
        orderNo: no || null,
        // Searchable/log summary line — first item type, falling back to the number.
        title: items.find((i) => i.carpetType)?.carpetType ?? (no ? `#${no}` : t('orders.title', 'Order')),
        quality: null,
        length: items[0].length,
        width: items[0].width,
        quantity: items.reduce((s, i) => s + i.quantity, 0),
        priceCents: order?.priceCents ?? 0,
        currency: order?.currency ?? defaultCurrency,
        status: order?.status ?? 'pending',
        orderDate: startOfDayEpoch(orderDate) ?? Date.now(),
        dueDate: order?.dueDate ?? null,
        notes: order?.notes ?? null,
        items
      }
      if (order) await window.api.orders.update(order.id, payload)
      else await window.api.orders.create(payload)
      toast.success(t('common.saved', 'Saved.'))
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
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{order ? t('orders.edit', 'Edit order') : t('orders.add', 'New order')}</DialogTitle>
        </DialogHeader>

        {/* Header: buyer + order number + date (same shape as the sell invoice) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t('orders.buyer', 'Buyer')}
              <RequiredMark />
            </span>
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
            {buyer?.phone && <span className="text-xs text-muted-foreground">{buyer.phone}</span>}
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('orders.orderNo', 'Order #')}</span>
            <Input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('orders.orderDate', 'Order date')}</span>
            <DateInput value={orderDate} onChange={setOrderDate} />
          </label>
        </div>

        {/* Item table */}
        <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-card">
          <div className="min-w-[1020px]">
            <div className={`${TABLE_GRID} border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground`}>
              <span className="text-center">{t('orders.rowNo', '#')}</span>
              <span>{t('orders.carpetType', 'Carpet type')}</span>
              <span>{t('orders.graph', 'Graph')}</span>
              <span className="text-end">{t('carpets.width', 'W')}</span>
              <span className="text-end">{t('carpets.length', 'L')}</span>
              <span className="text-end">{t('orders.sqm', 'SQM')}</span>
              <span>{t('orders.textColor', 'Field colour')}</span>
              <span>{t('orders.borderColor', 'Border colour')}</span>
              <span className="text-end">{t('orders.quantity', 'Qty')}</span>
              <span>{t('orders.description', 'Description')}</span>
              <span />
            </div>

            {rows.map((r, i) => (
              <div key={r.key} className={`${TABLE_GRID} border-b border-border px-3 py-1.5`}>
                <span className="text-center text-sm text-muted-foreground">{i + 1}</span>
                <Input
                  value={r.carpetType}
                  onChange={(e) => patch(r.key, (x) => ({ ...x, carpetType: e.target.value }))}
                  className="h-9"
                />
                <Input
                  value={r.graph}
                  onChange={(e) => patch(r.key, (x) => ({ ...x, graph: e.target.value }))}
                  className="h-9"
                />
                <Input
                  type="number"
                  step="0.01"
                  value={r.width}
                  onChange={(e) => patch(r.key, (x) => ({ ...x, width: e.target.value }))}
                  className="h-9 text-end"
                />
                <Input
                  type="number"
                  step="0.01"
                  value={r.length}
                  onChange={(e) => patch(r.key, (x) => ({ ...x, length: e.target.value }))}
                  className="h-9 text-end"
                />
                <Input
                  type="number"
                  step="0.01"
                  value={r.sqm}
                  onChange={(e) => patch(r.key, (x) => ({ ...x, sqm: e.target.value, sqmManual: true }))}
                  className="h-9 text-end"
                  title={t('invoice.areaHint', 'Defaults to L×W; edit to override.')}
                />
                <Input
                  value={r.textColor}
                  onChange={(e) => patch(r.key, (x) => ({ ...x, textColor: e.target.value }))}
                  className="h-9"
                />
                <Input
                  value={r.borderColor}
                  onChange={(e) => patch(r.key, (x) => ({ ...x, borderColor: e.target.value }))}
                  className="h-9"
                />
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={r.quantity}
                  onChange={(e) => patch(r.key, (x) => ({ ...x, quantity: e.target.value }))}
                  className="h-9 text-end"
                />
                <Input
                  value={r.description}
                  onChange={(e) => patch(r.key, (x) => ({ ...x, description: e.target.value }))}
                  className="h-9"
                  placeholder={t('invoice.descriptionPlaceholder', 'Description…')}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title={t('invoice.removeLine', 'Remove line')}
                  aria-label={t('invoice.removeLine', 'Remove line')}
                  onClick={() => removeRow(r.key)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <div className="flex items-center justify-between px-3 py-2">
              <Button variant="outline" size="sm" onClick={addRow}>
                <Plus className="h-4 w-4" />
                {t('invoice.addLine', 'Add row')}
              </Button>
              <div className="flex items-center gap-6 text-sm">
                <span>
                  <span className="text-muted-foreground">{t('orders.totalSqm', 'Total SQM')}: </span>
                  <span className="font-mono text-base font-semibold tabular-nums">{totalSqm.toFixed(2)}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">{t('orders.totalQty', 'Total qty')}: </span>
                  <span className="font-mono text-base font-semibold tabular-nums">{totalQty}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={submit} busy={busy}>
            {t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
