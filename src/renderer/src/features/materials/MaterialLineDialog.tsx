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
import { RequiredMark } from '@renderer/components/ui/required-mark'
import { toast } from '@renderer/components/ui/toast'
import { DateInput } from '@renderer/components/ui/date-input'
import { Typeahead } from '@renderer/components/ui/typeahead'
import { startOfDayEpoch } from '@renderer/lib/date'
import { parseMoneyToCents, formatCents, currencySymbol, materialLineTotalCents, materialLineProfitCents } from '@shared/accounting'
import type { Currency } from '@shared/accounting'
import type { ClientListItem } from '@shared/contracts'

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
  // Client is chosen through a type-to-search field: `query` is the raw text,
  // `client` is the confirmed selection (null until one is picked).
  const [query, setQuery] = useState('')
  const [client, setClient] = useState<ClientListItem | null>(null)
  const [kg, setKg] = useState('')
  const [ppk, setPpk] = useState('')
  const [date, setDate] = useState(todayStr())
  const [clients, setClients] = useState<ClientListItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setClient(null)
    setKg('')
    setPpk('')
    setDate(todayStr())
    setError(null)
    // Buys come from tar sellers («تار فروشان»); sells go to (carpet) sellers —
    // the record then shows on that client's «حساب تار» tab.
    void window.api.clients
      .list({ kind: direction === 'buy' ? 'tar_seller' : 'seller', includeArchived: false, limit: 1000, offset: 0 })
      .then((r) => setClients(r.rows))
  }, [open, direction])

  const clientItems = useMemo(
    () => clients.map((c) => ({ id: c.id, label: c.name, sublabel: c.phone ?? undefined })),
    [clients]
  )

  const calc = useMemo(() => {
    const kilograms = parseFloat(kg) || 0
    const ppkCents = parseMoneyToCents(ppk) ?? 0
    const total = materialLineTotalCents(ppkCents, kilograms)
    const profit = materialLineProfitCents({ direction: 'sell', currency, kilograms, pricePerKgCents: ppkCents }, avgBuyPerKgCents)
    return { kilograms, ppkCents, total, profit }
  }, [kg, ppk, currency, avgBuyPerKgCents])

  async function submit(): Promise<void> {
    if (!client) return setError(t('material.clientRequired', 'Choose a client.'))
    if (calc.kilograms <= 0) return setError(t('material.kgRequired', 'Kilograms must be greater than 0.'))
    setBusy(true)
    setError(null)
    try {
      await window.api.materials.addLine({
        materialId,
        direction,
        clientId: client.id,
        kilograms: calc.kilograms,
        pricePerKgCents: calc.ppkCents,
        transactionDate: startOfDayEpoch(date)
      })
      toast.success(t('common.saved', 'Saved.'))
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
            <span className="text-xs font-medium text-muted-foreground">
              {t('material.client', 'Client')}
              <RequiredMark />
            </span>
            <Typeahead
              value={query}
              onValueChange={(v) => {
                setQuery(v)
                setClient(null)
              }}
              items={clientItems}
              onSelect={(it) => {
                const c = clients.find((x) => x.id === it.id) ?? null
                setClient(c)
                setQuery(c?.name ?? '')
              }}
              placeholder={t('material.clientPlaceholder', 'Type a client name…')}
              autoFocus
            />
            {client?.phone && <span className="text-xs text-muted-foreground">{client.phone}</span>}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t('material.kilograms', 'Kilograms')}
                <RequiredMark />
              </span>
              <Input
                type="number"
                step="0.001"
                min="0"
                value={kg}
                onChange={(e) => setKg(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t('material.pricePerKg', 'Price / kg')} ({currencySymbol(currency)})
              </span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={ppk}
                onChange={(e) => setPpk(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('material.date', 'Date')}</span>
            <DateInput value={date} onChange={setDate} />
          </label>

          <div className="rounded-2xl border border-border/70 bg-card p-3 text-sm shadow-card">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('material.lineTotal', 'Total')}</span>
              <span className="font-mono tabular-nums">
                {formatCents(calc.total)} {currencySymbol(currency)}
              </span>
            </div>
            {direction === 'sell' && (
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">{t('material.lineProfit', 'Profit')}</span>
                <span
                  className={`font-mono tabular-nums ${calc.profit > 0 ? 'text-green-600 dark:text-green-400' : calc.profit < 0 ? 'text-red-600 dark:text-red-400' : ''}`}
                >
                  {formatCents(calc.profit)} {currencySymbol(currency)}
                </span>
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
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
