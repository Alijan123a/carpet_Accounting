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
import { startOfDayEpoch } from '@renderer/lib/date'
import { parseMoneyToCents, centsToInput } from '@shared/accounting'
import type { Currency } from '@shared/accounting'
import type { ExpenseView } from '@shared/contracts'

const todayStr = (): string => new Date().toISOString().slice(0, 10)
const toDateInput = (epoch: number): string => new Date(epoch).toISOString().slice(0, 10)

export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  expense?: ExpenseView | null
  onSaved: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('AFN')
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setCategory(expense?.category ?? '')
    setAmount(expense ? centsToInput(expense.amountCents) : '')
    setCurrency(expense?.currency ?? 'AFN')
    setDate(expense ? toDateInput(expense.expenseDate) : todayStr())
    setNote(expense?.note ?? '')
    setError(null)
  }, [open, expense])

  async function submit(): Promise<void> {
    if (!category.trim()) return setError(t('expenses.categoryRequired', 'Category is required.'))
    const cents = parseMoneyToCents(amount)
    if (cents == null || cents <= 0) return setError(t('expenses.amountRequired', 'Enter an amount greater than 0.'))
    setBusy(true)
    setError(null)
    try {
      const payload = {
        category: category.trim(),
        amountCents: cents,
        currency,
        expenseDate: startOfDayEpoch(date) ?? Date.now(),
        note: note.trim() || null
      }
      if (expense) await window.api.expenses.update(expense.id, payload)
      else await window.api.expenses.create(payload)
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
          <DialogTitle>{expense ? t('expenses.edit', 'Edit expense') : t('expenses.add', 'Add expense')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('expenses.category', 'Category')}</span>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} autoFocus />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t('expenses.amount', 'Amount')}</span>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t('expenses.currency', 'Currency')}</span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
                className="h-10 w-full rounded-lg border border-input bg-card shadow-soft px-3 text-sm"
              >
                <option value="AFN">AFN</option>
                <option value="USD">USD</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t('expenses.date', 'Date')}</span>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t('expenses.note', 'Note')}</span>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
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
