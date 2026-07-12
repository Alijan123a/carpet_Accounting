import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
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
import { cn } from '@renderer/lib/utils'
import {
  parseMoneyToCents,
  centsToInput,
  formatCents,
  formatCentsCompact,
  currencySymbol,
  effectivePricePerMeterCents,
  invoiceLineTotalCents,
  invoiceGrandTotalCents,
  areaFromDimsCm,
  ENABLED_CURRENCIES
} from '@shared/accounting'
import type { Currency } from '@shared/accounting'
import type { CarpetListItem, ClientListItem, SellInvoiceLineInput } from '@shared/contracts'
import type { InvoiceDocData } from './SellInvoicePdf'
import { InvoiceExportDialog } from './InvoiceExportDialog'

const todayStr = (): string => new Date().toISOString().slice(0, 10)

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

/** Tiny gray hint under a line field: the carpet's buy-side value / profit. */
function BuyHint({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return (
    <div className={cn('mt-0.5 truncate text-end text-[10px] leading-tight text-muted-foreground', className)}>
      {children}
    </div>
  )
}

/** Numbers derived from a line's raw input strings (single source for math). */
function lineCalc(line: Line): { areaNum: number; ppmCents: number; totalCents: number } {
  const l = parseFloat(line.length) || 0
  const w = parseFloat(line.width) || 0
  // Auto متراژ = L×W (cm) / 10000, floored to 2 decimals — shown = computed.
  const areaNum = line.areaManual ? parseFloat(line.area) || 0 : areaFromDimsCm(l, w)
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
  if (!next.areaManual) next.area = l > 0 && w > 0 ? String(areaFromDimsCm(l, w)) : ''
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
  /** Set once the bill is saved — opens the print/PDF/Excel chooser. */
  const [savedDoc, setSavedDoc] = useState<InvoiceDocData | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setBuyerQuery('')
    setBuyer(null)
    setDate(todayStr())
    setCurrency(null)
    setSavedDoc(null)
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
  // «مجموع متراژ» — sum of the (possibly overridden) line areas.
  const totalSqm = useMemo(() => lines.reduce((s, l) => s + lineCalc(l).areaNum, 0), [lines])

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

      // Build the document of record and open the print/PDF/Excel chooser
      // (the bill itself is already saved either way).
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

      toast.success(t('common.saved', 'Saved.'))
      onSaved()
      setSavedDoc(doc)
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
        sublabel: `${c.area.toFixed(2)} m² · ${currencySymbol(c.currency)}`
      })),
    [carpets]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t('invoice.title', 'Sell invoice')}</DialogTitle>
        </DialogHeader>

        {/* Header: buyer + number + date + currency. 12-col grid so the date
            field gets real width — the Shamsi day/month/year segments need it
            (they collapsed in the old equal-quarter layout). */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
          <label className="block space-y-1 lg:col-span-4">
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
          <label className="block space-y-1 lg:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">{t('invoice.number', 'Invoice #')}</span>
            {/* Bill # is unique and server-assigned — read-only (no edits). */}
            <Input value={number} readOnly disabled className="bg-muted/50 cursor-not-allowed" />
          </label>
          <label className="block space-y-1 lg:col-span-4">
            <span className="text-xs font-medium text-muted-foreground">{t('invoice.date', 'Date')}</span>
            <DateInput value={date} onChange={setDate} />
          </label>
          <label className="block space-y-1 lg:col-span-2">
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
                  {currencySymbol(c)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Line table */}
        <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-card">
          <div className="min-w-[960px]">
            <div className="grid grid-cols-[minmax(130px,1.2fr)_90px_90px_104px_110px_120px_minmax(140px,1.5fr)_40px] items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>{t('invoice.carpetNo', 'Carpet #')}</span>
              <span className="text-end">{t('carpets.length', 'L')}</span>
              <span className="text-end">{t('carpets.width', 'W')}</span>
              <span className="text-end">{t('invoice.area', 'Area')}</span>
              <span className="text-end">{t('invoice.unitPrice', 'Price/m')}</span>
              <span className="text-end">{t('invoice.lineTotal', 'Total')}</span>
              <span>{t('invoice.description', 'Description')}</span>
              <span />
            </div>

            {/* Scroll body so the footer buttons stay reachable with many rows. */}
            <div className="max-h-[48vh] overflow-y-auto">
            {lines.map((l) => {
              // Buy-side snapshot of the selected carpet: shown as tiny hints
              // under L / W / SQM / price / total, with the live line profit
              // (sell total − buy total). Display only — never posted.
              const buyCarpet = l.carpetId != null ? carpets.find((c) => c.id === l.carpetId) : undefined
              const profitCents = buyCarpet ? lineCalc(l).totalCents - buyCarpet.totalPriceCents : null
              const buyLabel = t('invoice.buyShort', 'Buy')
              return (
                <div
                  key={l.key}
                  className="grid grid-cols-[minmax(130px,1.2fr)_90px_90px_104px_110px_120px_minmax(140px,1.5fr)_40px] items-start gap-2 border-b border-border px-3 py-1.5"
                >
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
                  <div className="min-w-0">
                    <Input
                      type="number"
                      step="0.01"
                      value={l.length}
                      onChange={(e) => patch(l.key, (x) => ({ ...x, length: e.target.value }))}
                      className="h-9 text-end"
                    />
                    {buyCarpet && <BuyHint>{`${buyLabel} ${buyCarpet.length}`}</BuyHint>}
                  </div>
                  <div className="min-w-0">
                    <Input
                      type="number"
                      step="0.01"
                      value={l.width}
                      onChange={(e) => patch(l.key, (x) => ({ ...x, width: e.target.value }))}
                      className="h-9 text-end"
                    />
                    {buyCarpet && <BuyHint>{`${buyLabel} ${buyCarpet.width}`}</BuyHint>}
                  </div>
                  <div className="min-w-0">
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.01"
                        value={l.area}
                        onChange={(e) => patch(l.key, (x) => ({ ...x, area: e.target.value, areaManual: true }))}
                        className={cn('h-9 text-end', l.areaManual && 'ps-7')}
                        title={t('invoice.areaHint', 'Defaults to L×W; edit to override.')}
                      />
                      {/* Overridden متراژ: one click returns it to auto L×W. */}
                      {l.areaManual && (
                        <button
                          type="button"
                          onClick={() => patch(l.key, (x) => ({ ...x, areaManual: false }))}
                          title={t('invoice.areaReset', 'Back to L×W')}
                          aria-label={t('invoice.areaReset', 'Back to L×W')}
                          className="absolute start-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {buyCarpet && <BuyHint>{`${buyLabel} ${buyCarpet.area.toFixed(2)}`}</BuyHint>}
                  </div>
                  <div className="min-w-0">
                    <Input
                      type="number"
                      step="0.01"
                      value={l.ppm}
                      onChange={(e) => patch(l.key, (x) => ({ ...x, ppm: e.target.value }))}
                      className="h-9 text-end"
                    />
                    {buyCarpet && (
                      <BuyHint>
                        {`${buyLabel} ${formatCents(
                          effectivePricePerMeterCents(buyCarpet.pricePerMeterCents, buyCarpet.sortDeductionCents)
                        )}`}
                      </BuyHint>
                    )}
                  </div>
                  <div className="min-w-0">
                    <Input
                      type="number"
                      step="0.01"
                      value={l.total}
                      onChange={(e) => patch(l.key, (x) => ({ ...x, total: e.target.value, totalManual: true }))}
                      className="h-9 text-end"
                      title={t('invoice.totalHint', 'Defaults to area×price; edit to override.')}
                    />
                    {buyCarpet && <BuyHint>{`${buyLabel} ${formatCents(buyCarpet.totalPriceCents)}`}</BuyHint>}
                    {profitCents != null && (
                      <BuyHint
                        className={cn(
                          'font-medium',
                          profitCents > 0 && 'text-green-600 dark:text-green-400',
                          profitCents < 0 && 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {`${t('invoice.profitShort', 'Profit')} ${formatCents(profitCents)}`}
                      </BuyHint>
                    )}
                  </div>
                  <Input
                    value={l.description}
                    onChange={(e) => patch(l.key, (x) => ({ ...x, description: e.target.value }))}
                    className="h-9"
                    placeholder={t('invoice.descriptionPlaceholder', 'Description…')}
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
            </div>

            <div className="flex items-center justify-between px-3 py-2">
              <Button variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4" />
                {t('invoice.addLine', 'Add row')}
              </Button>
              <div className="flex items-center gap-6 text-sm">
                <span>
                  <span className="text-muted-foreground">{t('orders.totalSqm', 'Total SQM')}: </span>
                  <span className="font-mono text-base font-semibold tabular-nums">{totalSqm.toFixed(2)}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">{t('invoice.grandTotal', 'Grand total')}: </span>
                  <span className="font-mono text-base font-semibold tabular-nums">
                    {formatCentsCompact(grandTotalCents)} {currencySymbol(displayCurrency)}
                  </span>
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
            {t('invoice.savePrint', 'Save & Print')}
          </Button>
        </DialogFooter>

        {/* Post-save chooser: print / export PDF / export Excel. Closing it
            also closes the (already saved) invoice dialog. */}
        <InvoiceExportDialog
          doc={savedDoc}
          onClose={() => {
            setSavedDoc(null)
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
