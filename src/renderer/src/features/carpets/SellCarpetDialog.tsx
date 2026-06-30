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
import { startOfDayEpoch } from '@renderer/lib/date'
import {
  parseMoneyToCents,
  formatCents,
  effectivePricePerMeterCents,
  carpetTotalPriceCents
} from '@shared/accounting'
import type { CarpetListItem } from '@shared/contracts'

type SellableCarpet = Pick<CarpetListItem, 'id' | 'labelNumber' | 'area' | 'currency' | 'totalPriceCents'>

const todayStr = (): string => new Date().toISOString().slice(0, 10)

export function SellCarpetDialog({
  open,
  onOpenChange,
  carpet,
  onSold
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  carpet: SellableCarpet | null
  onSold: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [buyerId, setBuyerId] = useState('')
  const [ppm, setPpm] = useState('')
  const [deduction, setDeduction] = useState('')
  const [date, setDate] = useState(todayStr())
  const [clients, setClients] = useState<{ id: number; name: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setBuyerId('')
    setPpm('')
    setDeduction('')
    setDate(todayStr())
    setError(null)
    void window.api.clients.list({ includeArchived: false, limit: 1000, offset: 0 }).then((r) =>
      setClients(r.rows.map((c) => ({ id: c.id, name: c.name })))
    )
  }, [open])

  const cur = carpet?.currency ?? 'AFN'
  const area = carpet?.area ?? 0
  const buyTotal = carpet?.totalPriceCents ?? 0

  const calc = useMemo(() => {
    const ppmCents = parseMoneyToCents(ppm) ?? 0
    const dedCents = parseMoneyToCents(deduction) ?? 0
    const effectiveCents = effectivePricePerMeterCents(ppmCents, dedCents)
    const sellTotal = carpetTotalPriceCents(ppmCents, dedCents, area)
    return { ppmCents, dedCents, effectiveCents, sellTotal, profit: sellTotal - buyTotal }
  }, [ppm, deduction, area, buyTotal])

  async function submit(): Promise<void> {
    if (!carpet) return
    if (!buyerId) return setError(t('sale.buyerRequired', 'Choose a buyer.'))
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.carpets.sell({
        carpetId: carpet.id,
        buyerClientId: Number(buyerId),
        sellPricePerMeterCents: calc.ppmCents,
        sellSortDeductionCents: calc.dedCents,
        transactionDate: startOfDayEpoch(date)
      })
      if (!res.ok) {
        setError(res.reason === 'already_sold' ? t('sale.alreadySold', 'Already sold.') : (res.reason ?? 'error'))
        return
      }
      onSold()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('sale.title', 'Sell carpet')} {carpet ? `· ${carpet.labelNumber}` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('sale.buyer', 'Buyer (client)')}</span>
            <select
              value={buyerId}
              onChange={(e) => setBuyerId(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-card shadow-soft px-3 text-sm"
            >
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t('sale.sellPricePerMeter', 'Sell price / meter')} ({cur})
              </span>
              <Input type="number" step="0.01" value={ppm} onChange={(e) => setPpm(e.target.value)} autoFocus />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t('sale.sellDeduction', 'Sell deduction')} ({cur})
              </span>
              <Input type="number" step="0.01" value={deduction} onChange={(e) => setDeduction(e.target.value)} />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('payment.date', 'Date')}</span>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          {/* Live preview */}
          <div className="grid grid-cols-3 gap-3 rounded-2xl border border-border/70 bg-card p-3 text-sm shadow-card">
            <Preview label={t('sale.effectivePerMeter', 'Effective / m')} value={`${formatCents(calc.effectiveCents)} ${cur}`} />
            <Preview label={t('sale.sellTotal', 'Sell total')} value={`${formatCents(calc.sellTotal)} ${cur}`} />
            <Preview
              label={t('sale.profitPreview', 'Profit')}
              value={`${formatCents(calc.profit)} ${cur}`}
              colorClass={
                calc.profit > 0
                  ? 'text-green-600 dark:text-green-400'
                  : calc.profit < 0
                    ? 'text-red-600 dark:text-red-400'
                    : ''
              }
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {t('sale.sell', 'Sell')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Preview({ label, value, colorClass }: { label: string; value: string; colorClass?: string }): JSX.Element {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-mono tabular-nums ${colorClass ?? ''}`}>{value}</div>
    </div>
  )
}
