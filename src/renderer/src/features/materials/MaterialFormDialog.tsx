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
import { ENABLED_CURRENCIES, type Currency } from '@shared/accounting'
import { useSettings } from '@renderer/store/settings'

/** Create a new material (tar) lot: just a name + currency. Lines are added later. */
export function MaterialFormDialog({
  open,
  onOpenChange,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (id: number) => void
}): JSX.Element {
  const { t } = useTranslation()
  const defaultCurrency = useSettings((s) => s.defaultCurrency)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState<Currency>(defaultCurrency)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setCurrency(defaultCurrency)
      setError(null)
    }
  }, [open])

  async function submit(): Promise<void> {
    if (!name.trim()) return setError(t('material.nameRequired', 'Name is required.'))
    setBusy(true)
    try {
      const id = await window.api.materials.create({ name: name.trim(), currency })
      onSaved(id)
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
          <DialogTitle>{t('material.newLot', 'New material lot')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('material.name', 'Name')}</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('material.currency', 'Currency')}</span>
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
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {t('common.create', 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
