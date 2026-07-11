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
import { toast } from '@renderer/components/ui/toast'
import { DateInput } from '@renderer/components/ui/date-input'
import { startOfDayEpoch } from '@renderer/lib/date'
import {
  parseMoneyToCents,
  centsToInput,
  formatCents,
  currencySymbol,
  carpetTotalPriceCents,
  invoiceGrandTotalCents
} from '@shared/accounting'
import type { Currency } from '@shared/accounting'
import type { CarpetBatchLineInput, OrderAssignment, OrderItem } from '@shared/contracts'

const todayStr = (): string => new Date().toISOString().slice(0, 10)

/** Trim float noise on a computed area (m²) before showing it in the input. */
const round4 = (n: number): number => Math.round(n * 10000) / 10000

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n))

/** Sort grades are a fixed set (A, B, C) — same as the carpet forms. */
const SORT_GRADES: string[] = ['A', 'B', 'C']

/** Shared grid layout (header + body). Mirrors the buy-invoice grid, no remove column. */
const GRID =
  'grid grid-cols-[minmax(110px,1.3fr)_minmax(90px,1fr)_64px_64px_72px_68px_100px_100px_110px] items-center gap-2'

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

/** A fresh carpet row, pre-seeded from the ordered item's specs. */
function defaultLine(item: OrderItem | null): Line {
  return {
    key: lineSeq++,
    label: '',
    quality: '',
    length: item?.length != null ? String(item.length) : '',
    width: item?.width != null ? String(item.width) : '',
    area: item?.sqm != null ? String(round4(item.sqm)) : '',
    // Keep the ordered متراژ sticky when it was given (it is not always L×W).
    areaManual: item?.sqm != null,
    grade: '',
    ppm: '',
    deduction: '',
    total: '',
    totalManual: false
  }
}

/** Numbers derived from a line's raw input strings (single source for math). */
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
  const autoArea = l * w
  const areaNum = line.areaManual ? parseFloat(line.area) || 0 : autoArea
  const ppmCents = parseMoneyToCents(line.ppm) ?? 0
  const dedCents = parseMoneyToCents(line.deduction) ?? 0
  const autoTotalCents = carpetTotalPriceCents(ppmCents, dedCents, areaNum)
  const totalCents = line.totalManual ? parseMoneyToCents(line.total) ?? 0 : autoTotalCents
  return { areaNum, autoArea, ppmCents, dedCents, autoTotalCents, totalCents }
}

/**
 * Record the carpets a بافنده finished for one hand-off. Styled like the bulk
 * «افزودن قالین‌ها» (buy) grid: the seller is fixed (the hand-off's بافنده), a
 * quantity picks how many pieces were completed (≤ the hand-off quantity, and it
 * drives the number of carpet rows), and each row becomes a real warehouse
 * carpet. Saving posts every carpet + a purchase to the بافنده's account
 * atomically via {@link window.api.carpets.createBatch}.
 */
export function CompleteAssignmentDialog({
  open,
  onOpenChange,
  assignment,
  item,
  currency,
  onCompleted
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  assignment: OrderAssignment | null
  item: OrderItem | null
  currency: Currency
  onCompleted: (completedQty: number) => void
}): JSX.Element {
  const { t } = useTranslation()
  const maxQty = assignment?.quantity ?? 0

  const [qty, setQty] = useState('')
  const [date, setDate] = useState(todayStr())
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !assignment) return
    setError(null)
    setBusy(false)
    setDate(todayStr())
    setQty(String(maxQty))
    setLines(Array.from({ length: maxQty }, () => defaultLine(item)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assignment])

  // Changing the quantity grows/shrinks the row list (rows = pieces completed).
  function changeQty(raw: string): void {
    setQty(raw)
    const n = clamp(parseInt(raw, 10) || 0, 0, maxQty)
    setLines((prev) => {
      if (n === prev.length) return prev
      if (n < prev.length) return prev.slice(0, n)
      return [...prev, ...Array.from({ length: n - prev.length }, () => defaultLine(item))]
    })
  }

  function patch(key: number, updater: (l: Line) => Line): void {
    setLines((prev) => prev.map((l) => (l.key === key ? updater(l) : l)))
  }

  const grandTotalCents = useMemo(
    () => invoiceGrandTotalCents(lines.map((l) => lineCalc(l).totalCents)),
    [lines]
  )

  async function submit(): Promise<void> {
    if (!assignment) return
    // A row counts once it has a label; empty rows are simply skipped.
    const filled = lines.filter((l) => l.label.trim())
    if (!filled.length) return setError(t('complete.noLines', 'Add at least one carpet (label required).'))

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
        boughtFromClientId: assignment.sellerClientId,
        transactionDate: startOfDayEpoch(date),
        // These carpets were made to fulfil an order (not bought for stock).
        origin: 'ordered',
        lines: payloadLines
      })
      if (!res.ok) {
        setError(batchError(res.reason, res.label))
        return
      }
      toast.success(t('common.saved', 'Saved.'))
      onCompleted(filled.length)
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
        return t('complete.noLines', 'Add at least one carpet (label required).')
      default:
        return reason ?? t('common.error', 'An error occurred.')
    }
  }

  if (!assignment) return <Dialog open={open} onOpenChange={onOpenChange} />

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            {t('complete.title', 'Complete carpets')} — {item?.carpetType || t('common.none', '—')}
          </DialogTitle>
        </DialogHeader>

        {/* Shared header: بافنده (read-only) + quantity + complete date */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('orders.seller', 'بافنده')}</span>
            <select
              value={assignment.sellerClientId}
              disabled
              className="h-10 w-full rounded-lg border border-input bg-muted/50 px-3 text-sm disabled:opacity-100"
            >
              <option value={assignment.sellerClientId}>{assignment.sellerName || t('common.none', '—')}</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t('complete.quantity', 'Completed qty')} <span className="text-muted-foreground/70">(≤ {maxQty})</span>
            </span>
            <Input
              type="number"
              min="0"
              max={String(maxQty)}
              value={qty}
              onChange={(e) => changeQty(e.target.value)}
              className="h-10 text-end"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('complete.date', 'Completed on')}</span>
            <DateInput value={date} onChange={setDate} />
          </label>
        </div>

        {/* Line grid — one row per completed carpet */}
        <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-card">
          <div className="min-w-[900px]">
            <div className={`${GRID} border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground`}>
              <span>{t('carpets.label', 'Label #')}</span>
              <span>{t('carpets.quality', 'Quality')}</span>
              <span className="text-end">{t('carpets.length', 'L')}</span>
              <span className="text-end">{t('carpets.width', 'W')}</span>
              <span className="text-end">{t('carpets.area', 'Area')}</span>
              <span>{t('carpets.sortGrade', 'Grade')}</span>
              <span className="text-end">{t('carpets.pricePerMeter', 'Price/m')}</span>
              <span className="text-end">{t('carpets.deduction', 'Ded.')}</span>
              <span className="text-end">{t('carpets.totalPrice', 'Total')}</span>
            </div>

            <div className="max-h-[44vh] overflow-y-auto">
              {lines.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t('complete.setQty', 'Set a quantity to add carpet rows.')}
                </div>
              )}
              {lines.map((l) => {
                const { autoArea, autoTotalCents } = lineCalc(l)
                const areaValue = l.areaManual ? l.area : autoArea ? String(round4(autoArea)) : ''
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
                    <Input
                      type="number"
                      step="0.01"
                      value={areaValue}
                      onChange={(e) => patch(l.key, (x) => ({ ...x, area: e.target.value, areaManual: true }))}
                      className="h-9 text-end"
                      title={t('invoice.areaHint', 'Defaults to L×W; edit to override.')}
                    />
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
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-end px-3 py-2">
              <div className="text-sm">
                <span className="text-muted-foreground">{t('invoice.grandTotal', 'Grand total')}: </span>
                <span className="font-mono text-base font-semibold tabular-nums">
                  {formatCents(grandTotalCents)} {currencySymbol(currency)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* What completing does (CLAUDE.md §3: purchase posts to the بافنده's account). */}
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-700 dark:text-emerald-400">
          {t(
            'complete.moveHint',
            'All of these carpets move to the warehouse (گدام), and their total is added to the بافنده’s account in {{currency}}.',
            { currency: currencySymbol(currency) }
          )}
        </p>

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
            {t('complete.save', 'Complete & add to warehouse')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
