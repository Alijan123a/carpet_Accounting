import { useEffect, useMemo, useState } from 'react'
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
import { toast } from '@renderer/components/ui/toast'
import { DateInput } from '@renderer/components/ui/date-input'
import { Typeahead } from '@renderer/components/ui/typeahead'
import { useSettings } from '@renderer/store/settings'
import { startOfDayEpoch } from '@renderer/lib/date'
import { cn } from '@renderer/lib/utils'
import {
  parseMoneyToCents,
  centsToInput,
  formatCentsCompact,
  carpetTotalPriceCents,
  invoiceGrandTotalCents,
  areaFromDimsCm,
  ENABLED_CURRENCIES,
  currencySymbol
} from '@shared/accounting'
import type { Currency } from '@shared/accounting'
import type { ClientListItem, CarpetBatchLineInput } from '@shared/contracts'

const todayStr = (): string => new Date().toISOString().slice(0, 10)

/** Sort grades are a fixed set (A, B, C) — same as the single-carpet form. */
const SORT_GRADES: string[] = ['A', 'B', 'C']

/** One grid layout string shared by the header and body rows so they line up. */
const GRID =
  'grid grid-cols-[minmax(110px,1.3fr)_minmax(90px,1fr)_64px_64px_72px_68px_100px_100px_110px_36px] items-center gap-2'

interface Line {
  key: number
  label: string
  quality: string
  length: string
  width: string
  /** «متراژ» m². Sticky once edited (stops auto-deriving from L×W). */
  area: string
  areaManual: boolean
  grade: string
  ppm: string
  deduction: string
  /** Line total (major units). Sticky once edited (stops auto-deriving). */
  total: string
  totalManual: boolean
}

let lineSeq = 1
function emptyLine(): Line {
  return {
    key: lineSeq++,
    label: '',
    quality: '',
    length: '',
    width: '',
    area: '',
    areaManual: false,
    grade: '',
    ppm: '',
    deduction: '',
    total: '',
    totalManual: false
  }
}

/**
 * Numbers derived from a line's raw input strings. Area defaults to L×W but may
 * be overridden («متراژ» is not always a clean rectangle); the auto total is
 * (price − deduction) × area, but the user may override «جمله» directly.
 */
function lineCalc(line: Line): {
  areaNum: number
  autoArea: number
  ppmCents: number
  dedCents: number
  autoTotalCents: number
  totalCents: number
} {
  const l = parseFloat(line.length) || 0
  const w = parseFloat(line.width) || 0
  // Auto متراژ = L×W (cm) / 10000, floored to 2 decimals — shown = computed.
  const autoArea = areaFromDimsCm(l, w)
  const areaNum = line.areaManual ? parseFloat(line.area) || 0 : autoArea
  const ppmCents = parseMoneyToCents(line.ppm) ?? 0
  const dedCents = parseMoneyToCents(line.deduction) ?? 0
  const autoTotalCents = carpetTotalPriceCents(ppmCents, dedCents, areaNum)
  const totalCents = line.totalManual ? parseMoneyToCents(line.total) ?? 0 : autoTotalCents
  return { areaNum, autoArea, ppmCents, dedCents, autoTotalCents, totalCents }
}

/**
 * Bill-style bulk purchase: add several carpets at once. Mirrors the sell
 * invoice UX — a shared header (seller / date / currency) plus a scrollable line
 * grid. New carpets are always «در انبار». Saving posts every carpet (and its
 * purchase transaction, if a seller is chosen) atomically through
 * {@link window.api.carpets.createBatch}.
 */
export function BuyInvoiceDialog({
  open,
  onOpenChange,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const defaultCurrency = useSettings((s) => s.defaultCurrency)

  const [sellers, setSellers] = useState<ClientListItem[]>([])

  const [sellerQuery, setSellerQuery] = useState('')
  const [seller, setSeller] = useState<ClientListItem | null>(null)
  const [date, setDate] = useState(todayStr())
  const [currency, setCurrency] = useState<Currency>(defaultCurrency)
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSellerQuery('')
    setSeller(null)
    setDate(todayStr())
    setCurrency(defaultCurrency)
    setLines([emptyLine(), emptyLine(), emptyLine()])
    void window.api.clients
      .list({ kind: 'seller', includeArchived: false, limit: 1000, offset: 0 })
      .then((r) => setSellers(r.rows))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const grandTotalCents = useMemo(
    () => invoiceGrandTotalCents(lines.map((l) => lineCalc(l).totalCents)),
    [lines]
  )

  function patch(key: number, updater: (l: Line) => Line): void {
    setLines((prev) => prev.map((l) => (l.key === key ? updater(l) : l)))
  }

  function addLine(): void {
    setLines((prev) => [...prev, emptyLine()])
  }

  function removeLine(key: number): void {
    setLines((prev) => {
      const next = prev.filter((l) => l.key !== key)
      return next.length ? next : [emptyLine()]
    })
  }

  async function submit(): Promise<void> {
    // Keep only rows the user actually started (a label makes a row "real").
    const filled = lines.filter((l) => l.label.trim())
    if (!filled.length) return setError(t('buyInvoice.noLines', 'Add at least one carpet (label required).'))

    // Every included carpet needs positive dimensions (area = L×W).
    for (const l of filled) {
      if (!((parseFloat(l.length) || 0) > 0 && (parseFloat(l.width) || 0) > 0)) {
        return setError(
          t('buyInvoice.dimsRequired', 'Every carpet needs a length and width greater than 0: {{label}}', {
            label: l.label.trim()
          })
        )
      }
    }

    const payloadLines: CarpetBatchLineInput[] = filled.map((l) => {
      const { areaNum, ppmCents, dedCents, totalCents } = lineCalc(l)
      return {
        labelNumber: l.label.trim(),
        length: parseFloat(l.length) || 0,
        width: parseFloat(l.width) || 0,
        sortGrade: l.grade.trim() || null,
        quality: l.quality.trim() || null,
        pricePerMeterCents: ppmCents,
        sortDeductionCents: dedCents,
        area: areaNum,
        totalCents
      }
    })

    setBusy(true)
    setError(null)
    try {
      const res = await window.api.carpets.createBatch({
        currency,
        boughtFromClientId: seller?.id ?? null,
        transactionDate: seller ? startOfDayEpoch(date) : null,
        lines: payloadLines
      })
      if (!res.ok) {
        setError(batchError(res.reason, res.label))
        return
      }
      toast.success(t('common.saved', 'Saved.'))
      onSaved()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function batchError(reason?: string, label?: string): string {
    switch (reason) {
      case 'label_taken':
        return t('buyInvoice.labelTaken', 'Label “{{label}}” is already used.', { label: label ?? '' })
      case 'duplicate_label':
        return t('buyInvoice.duplicateLabel', 'Label “{{label}}” is repeated in this list.', { label: label ?? '' })
      case 'no_lines':
        return t('buyInvoice.noLines', 'Add at least one carpet (label required).')
      default:
        return reason ?? t('common.error', 'An error occurred.')
    }
  }

  const sellerItems = useMemo(
    () => sellers.map((s) => ({ id: s.id, label: s.name, sublabel: s.phone ?? undefined })),
    [sellers]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl [&_input]:text-center [&_select]:text-center">
        <DialogHeader>
          <DialogTitle>{t('buyInvoice.title', 'Add carpets (buy)')}</DialogTitle>
        </DialogHeader>

        {/* Shared header: seller + date + currency */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('buyInvoice.seller', 'Bought from (seller)')}</span>
            <Typeahead
              value={sellerQuery}
              onValueChange={(v) => {
                setSellerQuery(v)
                setSeller(null)
              }}
              items={sellerItems}
              onSelect={(it) => {
                const s = sellers.find((x) => x.id === it.id) ?? null
                setSeller(s)
                setSellerQuery(s?.name ?? '')
              }}
              placeholder={t('buyInvoice.sellerPlaceholder', 'Optional — type a seller name…')}
            />
            {seller?.phone && <span className="text-xs text-muted-foreground">{seller.phone}</span>}
          </label>
          <label
            className="block space-y-1"
            title={!seller ? t('buyInvoice.noSellerHint', 'No seller selected — carpets are added to the warehouse without posting a purchase to any account.') : undefined}
          >
            <span className="text-xs font-medium text-muted-foreground">{t('carpets.buyDate', 'Purchase date')}</span>
            <DateInput value={date} onChange={setDate} disabled={!seller} />
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
                  {currencySymbol(c)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Line grid */}
        <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-card">
          <div className="min-w-[960px]">
            <div className={`${GRID} border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground [&>span]:text-center`}>
              <span>{t('carpets.label', 'Label #')}</span>
              <span>{t('carpets.quality', 'Quality')}</span>
              <span className="text-end">{t('carpets.length', 'L')}</span>
              <span className="text-end">{t('carpets.width', 'W')}</span>
              <span className="text-end">{t('carpets.area', 'Area')}</span>
              <span>{t('carpets.sortGrade', 'Grade')}</span>
              <span className="text-end">{t('carpets.pricePerMeter', 'Price/m')}</span>
              <span className="text-end">{t('carpets.deduction', 'Ded.')}</span>
              <span className="text-end">{t('carpets.totalPrice', 'Total')}</span>
              <span />
            </div>

            {/* Scroll body so rows stay reachable when there are many carpets. */}
            <div className="max-h-[48vh] overflow-y-auto">
              {lines.map((l) => {
                const { autoArea, autoTotalCents } = lineCalc(l)
                const areaValue = l.areaManual ? l.area : autoArea ? String(autoArea) : ''
                const totalValue = l.totalManual ? l.total : autoTotalCents ? centsToInput(autoTotalCents) : ''
                return (
                  <div key={l.key} className={`${GRID} border-b border-border px-3 py-1.5`}>
                    <Input
                      value={l.label}
                      onChange={(e) => patch(l.key, (x) => ({ ...x, label: e.target.value }))}
                      placeholder={t('invoice.carpetPlaceholder', 'Label…')}
                      className="h-9"
                    />
                    <Input
                      value={l.quality}
                      onChange={(e) => patch(l.key, (x) => ({ ...x, quality: e.target.value }))}
                      className="h-9"
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
                    <div className="relative min-w-0">
                      <Input
                        type="number"
                        step="0.01"
                        value={areaValue}
                        onChange={(e) => patch(l.key, (x) => ({ ...x, area: e.target.value, areaManual: true }))}
                        className={cn('h-9 text-end', l.areaManual && 'ps-7')}
                        title={t('invoice.areaHint', 'Defaults to L×W; edit to override.')}
                      />
                      {/* Overridden متراژ: one click returns it to auto L×W. */}
                      {l.areaManual && (
                        <button
                          type="button"
                          onClick={() => patch(l.key, (x) => ({ ...x, area: '', areaManual: false }))}
                          title={t('invoice.areaReset', 'Back to L×W')}
                          aria-label={t('invoice.areaReset', 'Back to L×W')}
                          className="absolute start-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <select
                      value={l.grade}
                      onChange={(e) => patch(l.key, (x) => ({ ...x, grade: e.target.value }))}
                      className="h-9 w-full rounded-lg border border-input bg-card px-2 text-sm"
                    >
                      <option value="">{t('carpets.noGrade', '—')}</option>
                      {SORT_GRADES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
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
                      value={l.deduction}
                      onChange={(e) => patch(l.key, (x) => ({ ...x, deduction: e.target.value }))}
                      className="h-9 text-end"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={totalValue}
                      onChange={(e) => patch(l.key, (x) => ({ ...x, total: e.target.value, totalManual: true }))}
                      className="h-9 text-end"
                      title={t('buyInvoice.totalHint', 'Defaults to (price − deduction) × area; edit to override.')}
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
              <div className="text-sm">
                <span className="text-muted-foreground">{t('invoice.grandTotal', 'Grand total')}: </span>
                <span className="font-mono text-base font-semibold tabular-nums">
                  {formatCentsCompact(grandTotalCents)} {currencySymbol(currency)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {!seller && (
          <p className="text-xs text-muted-foreground">
            {t('buyInvoice.noSellerHint', 'No seller selected — carpets are added to the warehouse without posting a purchase to any account.')}
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
            {t('buyInvoice.save', 'Save carpets')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
