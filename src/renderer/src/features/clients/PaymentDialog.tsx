import { useEffect, useState } from 'react'
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
import { startOfDayEpoch } from '@renderer/lib/date'
import { parseMoneyToCents, ENABLED_CURRENCIES, currencySymbol } from '@shared/accounting'
import type { Currency } from '@shared/accounting'
import type { PaymentDirection } from '@shared/contracts'
import { useSettings } from '@renderer/store/settings'

const todayStr = (): string => new Date().toISOString().slice(0, 10)

export function PaymentDialog({
  open,
  onOpenChange,
  clientId,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: number
  onSaved: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const defaultCurrency = useSettings((s) => s.defaultCurrency)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>(defaultCurrency)
  const [direction, setDirection] = useState<PaymentDirection>('fromClient')
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setAmount('')
      setCurrency(defaultCurrency)
      setDirection('fromClient')
      setDate(todayStr())
      setNote('')
      setError(null)
    }
  }, [open, defaultCurrency])

  async function submit(): Promise<void> {
    const cents = parseMoneyToCents(amount)
    if (cents == null || cents <= 0) {
      setError(t('payment.amountRequired', 'Enter an amount greater than 0.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await window.api.clients.addPayment({
        clientId,
        currency,
        amountCents: cents,
        direction,
        transactionDate: startOfDayEpoch(date),
        note: note.trim() || null
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('payment.title', 'Add payment')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t('payment.amount', 'Amount')}
                <RequiredMark />
              </span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t('payment.currency', 'Currency')}</span>
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

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('payment.direction', 'Direction')}</span>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as PaymentDirection)}
              className="h-10 w-full rounded-lg border border-input bg-card shadow-soft px-3 text-sm"
            >
              <option value="fromClient">{t('payment.fromClient', 'Client paid us')}</option>
              <option value="toClient">{t('payment.toClient', 'We paid client')}</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t('payment.date', 'Date')}</span>
              <DateInput value={date} onChange={setDate} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t('payment.note', 'Note')}{' '}
                <span className="text-[10px]">({t('common.optional', 'optional')})</span>
              </span>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </label>
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
            {t('payment.add', 'Add payment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
