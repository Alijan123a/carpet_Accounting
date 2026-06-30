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
import { parseMoneyToCents, formatCents, materialLineTotalCents, materialLineProfitCents } from '@shared/accounting'
import type { Currency } from '@shared/accounting'

const todayStr = (): string => new Date().toISOString().slice(0, 10)

/** Add a buy or sell line to a material lot (posts the matching transaction). */
export function MaterialLineDialog({
  open,
  onOpenChange,
  materialId,
  direction,
  currency,
  avgBuyPerKgCents,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  materialId: number
  direction: 'buy' | 'sell'
  currency: Currency
  avgBuyPerKgCents: number
  onSaved: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [clientId, setClientId] = useState('')
  const [kg, setKg] = useState('')
  const [ppk, setPpk] = useState('')
  const [date, setDate] = useState(todayStr())
  const [clients, setClients] = useState<{ id: number; name: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setClientId('')
    setKg('')
    setPpk('')
    setDate(todayStr())
    setError(null)
    void window.api.clients.list({ includeArchived: false, limit: 1000, offset: 0 }).then((r) =>
      setClients(r.rows.map((c) => ({ id: c.id, name: c.name })))
    )
  }, [open])

  const calc = useMemo(() => {
    const kilograms = parseFloat(kg) || 0
    const ppkCents = parseMoneyToCents(ppk) ?? 0
    const total = materialLineTotalCents(ppkCents, kilograms)
    const profit = materialLineProfitCents({ direction: 'sell', currency, kilograms, pricePerKgCents: ppkCents }, avgBuyPerKgCents)
    return { kilograms, ppkCents, total, profit }
  }, [kg, ppk, currency, avgBuyPerKgCents])

  async function submit(): Promise<void> {
    if (!clientId) return setError(t('material.client', 'Choose a client.'))
    if (calc.kilograms <= 0) return setError(t('material.kgRequired', 'Kilograms must be greater than 0.'))
    setBusy(true)
    setError(null)
    try {
      await window.api.materials.addLine({
        materialId,
        direction,
        clientId: Number(clientId),
        kilograms: calc.kilograms,
        pricePerKgCents: calc.ppkCents,
        transactionDate: startOfDayEpoch(date)
      })
      onSaved()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const title = direction === 'buy' ? t('material.addBuy', 'Add buy') : t('material.addSell', 'Add sell')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('material.client', 'Client')}</span>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
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
              <span className="text-xs font-medium text-muted-foreground">{t('material.kilograms', 'Kilograms')}</span>
              <Input type="number" step="0.001" value={kg} onChange={(e) => setKg(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t('material.pricePerKg', 'Price / kg')} ({currency})
              </span>
              <Input type="number" step="0.01" value={ppk} onChange={(e) => setPpk(e.target.value)} />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('material.date', 'Date')}</span>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <div className="rounded-2xl border border-border/70 bg-card p-3 text-sm shadow-card">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('material.lineTotal', 'Total')}</span>
              <span className="font-mono tabular-nums">
                {formatCents(calc.total)} {currency}
              </span>
            </div>
            {direction === 'sell' && (
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">{t('material.lineProfit', 'Profit')}</span>
                <span
                  className={`font-mono tabular-nums ${calc.profit > 0 ? 'text-green-600 dark:text-green-400' : calc.profit < 0 ? 'text-red-600 dark:text-red-400' : ''}`}
                >
                  {formatCents(calc.profit)} {currency}
                </span>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
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
