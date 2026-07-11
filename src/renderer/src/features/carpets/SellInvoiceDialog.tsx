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
import {
  parseMoneyToCents,
  centsToInput,
  formatCents,
  invoiceLineTotalCents,
  invoiceGrandTotalCents,
  ENABLED_CURRENCIES
} from '@shared/accounting'
import type { Currency } from '@shared/accounting'
import type { CarpetListItem, ClientListItem, SellInvoiceLineInput } from '@shared/contracts'
import { generateInvoicePdf, type InvoiceDocData } from './SellInvoicePdf'

const todayStr = (): string => new Date().toISOString().slice(0, 10)

/** Trim float noise on a computed area (m²) before showing it in the input. */
const round4 = (n: number): number => Math.round(n * 10000) / 10000

interface Line {
  key: number
  carpetId: number | null
  goodsType: string
  /** «تفصیل» — free-text line description. */
  description: string
  /** Typeahead text / snapshot label (نمبر قالین). */
  label: string
  length: string
  width: string
  area: string
  /** Sticky flag: once the user edits متراژ, stop auto-deriving it from L×W. */
  areaManual: boolean
  /** Unit price per meter (major units). */
  ppm: string
  total: string
  /** Sticky flag: once the user edits جمله, stop auto-deriving it from area×price. */
  totalManual: boolean
}

let lineSeq = 1
function emptyLine(goodsType: string): Line {
  return {
    key: lineSeq++,
    carpetId: null,
    goodsType,
    description: '',
    label: '',
    length: '',
    width: '',
    area: '',
    areaManual: false,
    ppm: '',
    total: '',
    totalManual: false
  }
}

/** Numbers derived from a line's raw input strings (single source for math). */
function lineCalc(line: Line): { areaNum: number; ppmCents: number; totalCents: number } {
  const l = parseFloat(line.length) || 0
  const w = parseFloat(line.width) || 0
  const areaNum = line.areaManual ? parseFloat(line.area) || 0 : l * w
  const ppmCents = parseMoneyToCents(line.ppm) ?? 0
  const totalCents = line.totalManual
    ? parseMoneyToCents(line.total) ?? 0
    : invoiceLineTotalCents(areaNum, ppmCents)
  return { areaNum, ppmCents, totalCents }
}

/**
 * Re-sync the auto-derived display strings (متراژ, جمله) after any edit, unless
 * that field has been made sticky. Keeps what the user sees equal to what
 * lineCalc() computes for the grand total and posting.
 */
function normalize(line: Line): Line {
  const l = parseFloat(line.length) || 0
  const w = parseFloat(line.width) || 0
  const next = { ...line }
  if (!next.areaManual) next.area = l > 0 && w > 0 ? String(round4(l * w)) : ''
  if (!next.totalManual) {
    const { areaNum, ppmCents } = lineCalc(next)
    const tc = invoiceLineTotalCents(areaNum, ppmCents)
    next.total = tc ? centsToInput(tc) : ''
  }
  return next
}

export function SellInvoiceDialog({
  open,
  onOpenChange,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const language = useSettings((s) => s.language)
  const calendar = useSettings((s) => s.calendar)
  const defaultCurrency = useSettings((s) => s.defaultCurrency)
  // Default «نوع جنس» for a new line (Dari «قالین» / English "Carpet").
  const carpetLabel = t('invoice.defaultGoods', 'قالین')

  const [buyers, setBuyers] = useState<ClientListItem[]>([])
  const [carpets, setCarpets] = useState<CarpetListItem[]>([])

  const [buyerQuery, setBuyerQuery] = useState('')
  const [buyer, setBuyer] = useState<ClientListItem | null>(null)
  const [number, setNumber] = useState('')
  const [date, setDate] = useState(todayStr())
  const [currency, setCurrency] = useState<Currency | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setBuyerQuery('')
    setBuyer(null)
    setDate(todayStr())
    setCurrency(null)
    setLines([emptyLine(carpetLabel)])
    void window.api.clients
      .list({ kind: 'buyer', includeArchived: false, limit: 1000, offset: 0 })
      .then((r) => setBuyers(r.rows))
    void window.api.carpets
      .list({ status: 'in_warehouse', includeArchived: false, limit: 1000, offset: 0 })
      .then((r) => setCarpets(r.rows))
    void window.api.carpets.nextInvoiceNumber().then(setNumber)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const displayCurrency: Currency = currency ?? defaultCurrency
  // Once a carpet line exists the invoice currency is dictated by the carpet(s),
  // so the manual selector is locked (a mixed-currency invoice is not allowed).
  const hasCarpetLine = lines.some((l) => l.carpetId != null)

  const grandTotalCents = useMemo(
    () => invoiceGrandTotalCents(lines.map((l) => lineCalc(l).totalCents)),
    [lines]
  )

  // Warn when an overridden area/total makes the printed line total differ from
  // what the ledger will post (posted total = carpet stored area × unit price).
  const mismatchLines = useMemo(
    () =>
      lines.filter((l) => {
        if (l.carpetId == null) return false
        const c = carpets.find((x) => x.id === l.carpetId)
        if (!c) return false
        const { ppmCents, totalCents } = lineCalc(l)
        const postedTotal = invoiceLineTotalCents(c.area, ppmCents)
        return postedTotal !== totalCents
      }),
    [lines, carpets]
  )

  function patch(key: number, updater: (l: Line) => Line): void {
    setLines((prev) => prev.map((l) => (l.key === key ? normalize(updater(l)) : l)))
  }

  function selectCarpet(key: number, c: CarpetListItem): void {
    // Enforce a single-currency invoice: infer from the first carpet, block mixing.
    if (currency && c.currency !== currency) {
      setError(t('invoice.currencyMismatch', 'All carpet lines must share the same currency.'))
      return
    }
    if (!currency) setCurrency(c.currency)
    setError(null)
    patch(key, (l) => ({
      ...l,
      carpetId: c.id,
      label: c.labelNumber,
      length: String(c.length),
      width: String(c.width),
      areaManual: false,
      ppm: centsToInput(c.pricePerMeterCents),
      totalManual: false
    }))
  }

  function addLine(): void {
    setLines((prev) => [...prev, emptyLine(carpetLabel)])
  }

  function removeLine(key: number): void {
    setLines((prev) => {
      const next = prev.filter((l) => l.key !== key)
      // If no carpet lines remain, currency is free again.
      if (!next.some((l) => l.carpetId != null)) setCurrency(null)
      return next.length ? next : [emptyLine(carpetLabel)]
    })
  }

  async function submit(): Promise<void> {
    if (!buyer) return setError(t('invoice.buyerRequired', 'Choose a buyer.'))
    const payloadLines: SellInvoiceLineInput[] = lines
      .filter((l) => l.carpetId != null || l.label.trim() || parseMoneyToCents(l.total))
      .map((l) => {
        const { areaNum, ppmCents, totalCents } = lineCalc(l)
        return {
          carpetId: l.carpetId,
          goodsType: l.goodsType.trim() || carpetLabel,
          description: l.description.trim() || null,
          labelNumber: l.label.trim(),
          length: parseFloat(l.length) || 0,
          width: parseFloat(l.width) || 0,
          area: areaNum,
          unitPriceCents: ppmCents,
          totalCents
        }
      })
    if (!payloadLines.length) return setError(t('invoice.noLines', 'Add at least one line.'))

    setBusy(true)
    setError(null)
    try {
      const res = await window.api.carpets.sellInvoice({
        number: number.trim(),
        buyerClientId: buyer.id,
        currency: displayCurrency,
        transactionDate: startOfDayEpoch(date),
        lines: payloadLines
      })
      if (!res.ok) {
        setError(invoiceError(res.reason))
        return
      }

      // Print: build the document of record and hand it to the native Save dialog.
      const doc: InvoiceDocData = {
        number: res.number ?? number.trim(),
        dateEpoch: startOfDayEpoch(date) ?? Date.now(),
        buyerName: buyer.name,
        buyerPhone: buyer.phone,
        currency: displayCurrency,
        lines: payloadLines.map((l) => ({
          goodsType: l.goodsType,
          description: l.description ?? null,
          labelNumber: l.labelNumber,
          length: l.length,
          width: l.width,
          area: l.area,
          unitPriceCents: l.unitPriceCents,
          totalCents: l.totalCents
        })),
        grandTotalCents,
        direction: language === 'fa' ? 'rtl' : 'ltr',
        calendar
      }
      const bytes = await generateInvoicePdf(doc)
      await window.api.pdf.save(`invoice-${doc.number}.pdf`, bytes)

      toast.success(t('common.saved', 'Saved.'))
      onSaved()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function invoiceError(reason?: string): string {
    switch (reason) {
      case 'already_sold':
        return t('invoice.errAlreadySold', 'One of the carpets is already sold. Refresh and try again.')
      case 'currency_mismatch':
        return t('invoice.currencyMismatch', 'All carpet lines must share the same currency.')
      case 'carpet_not_found':
        return t('invoice.errCarpetMissing', 'A selected carpet no longer exists.')
      case 'no_lines':
        return t('invoice.noLines', 'Add at least one line.')
      case 'buyer_required':
        return t('invoice.buyerRequired', 'Choose a buyer.')
      default:
        return reason ?? t('common.error', 'An error occurred.')
    }
  }

  const buyerItems = useMemo(
    () => buyers.map((b) => ({ id: b.id, label: b.name, sublabel: b.phone ?? undefined })),
    [buyers]
  )
  const carpetItems = useMemo(
    () =>
      carpets.map((c) => ({
        id: c.id,
        label: c.labelNumber,
        sublabel: `${c.area.toFixed(2)} m² · ${c.currency}`
      })),
    [carpets]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t('invoice.title', 'Sell invoice')}</DialogTitle>
        </DialogHeader>

        {/* Header: buyer + number + date + currency */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t('invoice.buyer', 'Buyer')}
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
            <span className="text-xs font-medium text-muted-foreground">{t('invoice.number', 'Invoice #')}</span>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('invoice.date', 'Date')}</span>
            <DateInput value={date} onChange={setDate} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('invoice.currency', 'Currency')}</span>
            <select
              value={displayCurrency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              disabled={hasCarpetLine}
              title={
                hasCarpetLine
                  ? t('invoice.currencyLocked', 'Currency follows the selected carpets and cannot be changed.')
                  : undefined
              }
              className="h-10 w-full rounded-lg border border-input bg-card shadow-soft px-3 text-sm disabled:opacity-50"
            >
              {ENABLED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Line table */}
        <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-card">
          <div className="min-w-[1020px]">
            <div className="grid grid-cols-[minmax(90px,1fr)_minmax(100px,1.1fr)_minmax(110px,1.2fr)_96px_96px_104px_110px_120px_40px] items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>{t('invoice.goodsType', 'Goods')}</span>
              <span>{t('invoice.description', 'Description')}</span>
              <span>{t('invoice.carpetNo', 'Carpet #')}</span>
              <span className="text-end">{t('carpets.length', 'L')}</span>
              <span className="text-end">{t('carpets.width', 'W')}</span>
              <span className="text-end">{t('invoice.area', 'Area')}</span>
              <span className="text-end">{t('invoice.unitPrice', 'Price/m')}</span>
              <span className="text-end">{t('invoice.lineTotal', 'Total')}</span>
              <span />
            </div>

            {lines.map((l) => {
              return (
                <div
                  key={l.key}
                  className="grid grid-cols-[minmax(90px,1fr)_minmax(100px,1.1fr)_minmax(110px,1.2fr)_96px_96px_104px_110px_120px_40px] items-center gap-2 border-b border-border px-3 py-1.5"
                >
                  <Input
                    value={l.goodsType}
                    onChange={(e) => patch(l.key, (x) => ({ ...x, goodsType: e.target.value }))}
                    className="h-9"
                  />
                  <Input
                    value={l.description}
                    onChange={(e) => patch(l.key, (x) => ({ ...x, description: e.target.value }))}
                    className="h-9"
                    placeholder={t('invoice.descriptionPlaceholder', 'Description…')}
                  />
                  <Typeahead
                    value={l.label}
                    onValueChange={(v) =>
                      patch(l.key, (x) => ({ ...x, label: v, carpetId: v === x.label ? x.carpetId : null }))
                    }
                    items={carpetItems}
                    onSelect={(it) => {
                      const c = carpets.find((x) => x.id === it.id)
                      if (c) selectCarpet(l.key, c)
                    }}
                    placeholder={t('invoice.carpetPlaceholder', 'Label…')}
                    className="min-w-0"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={l.length}
                    onChange={(e) => patch(l.key, (x) => ({ ...x, length: e.target.value }))}
                    className="h-9 text-end"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={l.width}
                    onChange={(e) => patch(l.key, (x) => ({ ...x, width: e.target.value }))}
                    className="h-9 text-end"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={l.area}
                    onChange={(e) => patch(l.key, (x) => ({ ...x, area: e.target.value, areaManual: true }))}
                    className="h-9 text-end"
                    title={t('invoice.areaHint', 'Defaults to L×W; edit to override.')}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={l.ppm}
                    onChange={(e) => patch(l.key, (x) => ({ ...x, ppm: e.target.value }))}
                    className="h-9 text-end"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={l.total}
                    onChange={(e) => patch(l.key, (x) => ({ ...x, total: e.target.value, totalManual: true }))}
                    className="h-9 text-end"
                    title={t('invoice.totalHint', 'Defaults to area×price; edit to override.')}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={t('invoice.removeLine', 'Remove line')}
                    aria-label={t('invoice.removeLine', 'Remove line')}
                    onClick={() => removeLine(l.key)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}

            <div className="flex items-center justify-between px-3 py-2">
              <Button variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4" />
                {t('invoice.addLine', 'Add row')}
              </Button>
              <div className="text-sm">
                <span className="text-muted-foreground">{t('invoice.grandTotal', 'Grand total')}: </span>
                <span className="font-mono text-base font-semibold tabular-nums">
                  {formatCents(grandTotalCents)} {displayCurrency}
                </span>
              </div>
            </div>
          </div>
        </div>

        {mismatchLines.length > 0 && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
            {t(
              'invoice.mismatchWarn',
              'A line’s area/total was overridden. The printed invoice is the record; the posted ledger sale uses the carpet’s stored area.'
            )}
          </p>
        )}
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
            {t('invoice.savePrint', 'Save & Print')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
