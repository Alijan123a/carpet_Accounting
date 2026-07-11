import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { RequiredMark } from '@renderer/components/ui/required-mark'
import { toast } from '@renderer/components/ui/toast'
import { DateInput } from '@renderer/components/ui/date-input'
import { useSettings } from '@renderer/store/settings'
import { startOfDayEpoch } from '@renderer/lib/date'
import {
  parseMoneyToCents,
  centsToInput,
  formatCents,
  effectivePricePerMeterCents,
  carpetTotalPriceCents,
  ENABLED_CURRENCIES,
  currencySymbol
} from '@shared/accounting'
import type { Currency } from '@shared/accounting'
import type { CarpetDetailView, CarpetStatus } from '@shared/contracts'
import { statusLabel } from './statusLabel'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  carpet?: CarpetDetailView | null
  onSaved: () => void
}

const todayStr = (): string => new Date().toISOString().slice(0, 10)

/** Sort grades are a fixed set (A, B, C). */
const SORT_GRADES: string[] = ['A', 'B', 'C']

export function CarpetFormDialog({ open, onOpenChange, carpet, onSaved }: Props): JSX.Element {
  const { t } = useTranslation()
  const language = useSettings((s) => s.language)
  const defaultCurrency = useSettings((s) => s.defaultCurrency)
  const isEdit = !!carpet
  const locked = !!carpet?.hasBuyTransaction // financials locked once a purchase exists

  const [label, setLabel] = useState('')
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [sortGrade, setSortGrade] = useState('')
  const [quality, setQuality] = useState('')
  const [currency, setCurrency] = useState<Currency>(defaultCurrency)
  const [ppm, setPpm] = useState('')
  const [deduction, setDeduction] = useState('')
  const [status, setStatus] = useState('in_warehouse')
  const [sellerId, setSellerId] = useState('')
  const [buyDate, setBuyDate] = useState(todayStr())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [clients, setClients] = useState<{ id: number; name: string }[]>([])
  const [statuses, setStatuses] = useState<CarpetStatus[]>([])

  useEffect(() => {
    if (!open) return
    setError(null)
    setLabel(carpet?.labelNumber ?? '')
    setLength(carpet ? String(carpet.length) : '')
    setWidth(carpet ? String(carpet.width) : '')
    setSortGrade(carpet?.sortGrade ?? '')
    setQuality(carpet?.quality ?? '')
    setCurrency(carpet?.currency ?? defaultCurrency)
    setPpm(carpet ? centsToInput(carpet.pricePerMeterCents) : '')
    setDeduction(carpet ? centsToInput(carpet.sortDeductionCents) : '')
    setStatus(carpet?.status ?? 'in_warehouse')
    setSellerId('')
    setBuyDate(todayStr())
    void window.api.carpetStatuses.list().then(setStatuses)
    void window.api.clients.list({ includeArchived: false, limit: 1000, offset: 0 }).then((r) =>
      setClients(r.rows.map((c) => ({ id: c.id, name: c.name })))
    )
  }, [open, carpet])

  // ---- Live auto-calculation (CLAUDE.md: area = L×W; effective = ppm − ded; total = effective × area)
  const calc = useMemo(() => {
    const l = parseFloat(length) || 0
    const w = parseFloat(width) || 0
    const area = l * w
    const ppmCents = parseMoneyToCents(ppm) ?? 0
    const dedCents = parseMoneyToCents(deduction) ?? 0
    const effectiveCents = effectivePricePerMeterCents(ppmCents, dedCents)
    const totalCents = carpetTotalPriceCents(ppmCents, dedCents, area)
    return { area, ppmCents, dedCents, effectiveCents, totalCents, exceeds: dedCents > ppmCents }
  }, [length, width, ppm, deduction])

  // Fixed A/B/C list; keep any legacy value already on the carpet so editing it
  // never silently drops an out-of-list grade.
  const gradeOptions = useMemo(
    () => (sortGrade && !SORT_GRADES.includes(sortGrade) ? [sortGrade, ...SORT_GRADES] : SORT_GRADES),
    [sortGrade]
  )

  async function submit(): Promise<void> {
    if (!label.trim()) return setError(t('carpets.labelRequired', 'Label number is required.'))
    const l = parseFloat(length) || 0
    const w = parseFloat(width) || 0
    if (l <= 0 || w <= 0) return setError(t('carpets.dimsRequired', 'Length and width must be greater than 0.'))

    setBusy(true)
    setError(null)
    try {
      if (isEdit && carpet) {
        const res = await window.api.carpets.update(carpet.id, {
          labelNumber: label.trim(),
          length: l,
          width: w,
          sortGrade: sortGrade.trim() || null,
          quality: quality.trim() || null,
          currency,
          pricePerMeterCents: calc.ppmCents,
          sortDeductionCents: calc.dedCents,
          status
        })
        if (!res.ok) return fail(res.reason)
      } else {
        const sellerNum = sellerId ? Number(sellerId) : null
        const res = await window.api.carpets.create({
          labelNumber: label.trim(),
          length: l,
          width: w,
          sortGrade: sortGrade.trim() || null,
          quality: quality.trim() || null,
          currency,
          pricePerMeterCents: calc.ppmCents,
          sortDeductionCents: calc.dedCents,
          status,
          boughtFromClientId: sellerNum,
          transactionDate: sellerNum ? startOfDayEpoch(buyDate) : null
        })
        if (!res.ok) return fail(res.reason)
      }
      toast.success(t('common.saved', 'Saved.'))
      onSaved()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }

    function fail(reason?: string): void {
      setError(
        reason === 'label_taken'
          ? t('carpets.labelTaken', 'That label number is already used.')
          : (reason ?? t('common.error', 'An error occurred.'))
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('carpets.edit', 'Edit Carpet') : t('carpets.add', 'Add Carpet')}</DialogTitle>
        </DialogHeader>

        {locked && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
            {t('carpets.financialsLocked', 'Financial fields are locked because a purchase is recorded.')}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Labeled label={t('carpets.label', 'Label #')} required>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
          </Labeled>
          <Labeled label={t('carpets.sortGrade', 'Sort grade')}>
            <select
              value={sortGrade}
              onChange={(e) => setSortGrade(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-card shadow-soft px-3 text-sm"
            >
              <option value="">{t('carpets.noGrade', '— none —')}</option>
              {gradeOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label={t('carpets.quality', 'Quality')}>
            <Input value={quality} onChange={(e) => setQuality(e.target.value)} />
          </Labeled>
          <Labeled label={`${t('carpets.length', 'Length')} (m)`} required>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              disabled={locked}
            />
          </Labeled>
          <Labeled label={`${t('carpets.width', 'Width')} (m)`} required>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              disabled={locked}
            />
          </Labeled>
          <Labeled label={t('carpets.currency', 'Currency')}>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              disabled={locked}
              className="h-10 w-full rounded-lg border border-input bg-card shadow-soft px-3 text-sm disabled:opacity-50"
            >
              {ENABLED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {currencySymbol(c)}
                </option>
              ))}
            </select>
          </Labeled>
          {/* New carpets are always «در انبار»; status is only editable afterwards. */}
          {isEdit && (
            <Labeled label={t('carpets.status', 'Status')}>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-card shadow-soft px-3 text-sm"
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.key}>
                    {statusLabel(s, language)}
                  </option>
                ))}
              </select>
            </Labeled>
          )}
          <Labeled label={`${t('carpets.pricePerMeter', 'Price / meter')} (${currencySymbol(currency)})`}>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={ppm}
              onChange={(e) => setPpm(e.target.value)}
              disabled={locked}
            />
          </Labeled>
          <Labeled label={`${t('carpets.deduction', 'Sort deduction')} (${currencySymbol(currency)})`}>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={deduction}
              onChange={(e) => setDeduction(e.target.value)}
              disabled={locked}
            />
          </Labeled>
        </div>

        {/* Seller + purchase date (create only) */}
        {!isEdit && (
          <div className="grid grid-cols-2 gap-3">
            <Labeled label={t('carpets.seller', 'Bought from (seller)')}>
              <select
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-card shadow-soft px-3 text-sm"
              >
                <option value="">{t('carpets.noSeller', '— none —')}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Labeled>
            {sellerId && (
              <Labeled label={t('carpets.buyDate', 'Purchase date')}>
                <DateInput value={buyDate} onChange={setBuyDate} />
              </Labeled>
            )}
          </div>
        )}

        {/* Live calculation summary */}
        <div className="grid grid-cols-3 gap-3 rounded-2xl border border-border/70 bg-card p-3 text-sm shadow-card">
          <Calc label={t('carpets.area', 'Area')} value={`${calc.area.toFixed(2)} m²`} />
          <Calc
            label={t('carpets.effectivePerMeter', 'Effective / meter')}
            value={`${formatCents(calc.effectiveCents)} ${currencySymbol(currency)}`}
          />
          <Calc label={t('carpets.totalPrice', 'Total price')} value={`${formatCents(calc.totalCents)} ${currencySymbol(currency)}`} strong />
        </div>
        {calc.exceeds && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {t('carpets.deductionExceeds', 'Deduction exceeds price/meter — effective price is treated as 0.')}
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
            {t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Labeled({
  label,
  required,
  children
}: {
  label: string
  required?: boolean
  children: ReactNode
}): JSX.Element {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <RequiredMark />}
      </span>
      {children}
    </label>
  )
}

function Calc({ label, value, strong }: { label: string; value: string; strong?: boolean }): JSX.Element {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-mono tabular-nums ${strong ? 'text-base font-semibold' : ''}`}>{value}</div>
    </div>
  )
}
