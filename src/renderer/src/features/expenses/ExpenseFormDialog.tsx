import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
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
import { parseMoneyToCents, centsToInput, ENABLED_CURRENCIES } from '@shared/accounting'
import type { Currency } from '@shared/accounting'
import type { ExpenseView, ExpenseType } from '@shared/contracts'
import { useSettings } from '@renderer/store/settings'

const todayStr = (): string => new Date().toISOString().slice(0, 10)
const toDateInput = (epoch: number): string => new Date(epoch).toISOString().slice(0, 10)

export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
  onSaved,
  onDelete
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  expense?: ExpenseView | null
  onSaved: () => void
  /** Shown only when editing — lets the caller run its delete-confirm flow. */
  onDelete?: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const defaultCurrency = useSettings((s) => s.defaultCurrency)
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>(defaultCurrency)
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const [types, setTypes] = useState<ExpenseType[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setCategory(expense?.category ?? '')
    setAmount(expense ? centsToInput(expense.amountCents) : '')
    setCurrency(expense?.currency ?? defaultCurrency)
    setDate(expense ? toDateInput(expense.expenseDate) : todayStr())
    setNote(expense?.note ?? '')
    setError(null)
    void window.api.expenseTypes.list().then(setTypes)
  }, [open, expense, defaultCurrency])

  const typeItems = useMemo(() => types.map((ty) => ({ id: ty.name, label: ty.name })), [types])

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
          <DialogTitle>{expense ? t('expenses.edit', 'Edit expense') : t('expenses.add', 'Add expense')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t('expenses.category', 'Category')}
              <RequiredMark />
            </span>
            <Typeahead
              value={category}
              onValueChange={setCategory}
              items={typeItems}
              onSelect={(it) => setCategory(String(it.label))}
              placeholder={t('expenses.categoryPlaceholder', 'Type or pick a category…')}
              autoFocus
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t('expenses.amount', 'Amount')}
                <RequiredMark />
              </span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t('expenses.currency', 'Currency')}</span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
                className="h-10 w-full rounded-lg border border-input bg-card shadow-soft px-3 text-sm"
              >
                {ENABLED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {/* Date on its own full-width row so the Shamsi day/month/year
              segments always have room (the month collapsed in a half column). */}
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('expenses.date', 'Date')}</span>
            <DateInput value={date} onChange={setDate} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t('expenses.note', 'Note')}{' '}
              <span className="text-[10px]">({t('common.optional', 'optional')})</span>
            </span>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          {expense && onDelete ? (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4" />
              {t('common.delete', 'Delete')}
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={submit} busy={busy}>
              {t('common.save', 'Save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
