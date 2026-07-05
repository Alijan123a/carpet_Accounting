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
import type { ClientKind, ClientListItem } from '@shared/contracts'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null/undefined = create mode; an item = edit mode. */
  client?: ClientListItem | null
  /** Pre-selected role for new clients (from the Buyers/Sellers screen). */
  defaultKind?: 'buyer' | 'seller'
  onSaved: () => void
}

/**
 * Add / Edit client. ONLY profile fields (name, phone, notes, role) are editable
 * here. Balances are never edited — they derive solely from transactions.
 */
export function ClientFormDialog({ open, onOpenChange, client, defaultKind, onSaved }: Props): JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [kind, setKind] = useState<ClientKind>('both')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setName(client?.name ?? '')
      setPhone(client?.phone ?? '')
      setNotes(client?.notes ?? '')
      // Edit: keep the client's stored role. Create: default to the current screen's role.
      setKind(client?.kind ?? defaultKind ?? 'both')
      setError(null)
    }
  }, [open, client, defaultKind])

  async function submit(): Promise<void> {
    if (!name.trim()) {
      setError(t('clients.nameRequired', 'Name is required.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const payload = { name: name.trim(), phone: phone.trim() || null, notes: notes.trim() || null, kind }
      if (client) {
        await window.api.clients.update(client.id, payload)
      } else {
        await window.api.clients.create(payload)
      }
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
          <DialogTitle>{client ? t('clients.edit', 'Edit Client') : t('clients.add', 'Add Client')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('clients.name', 'Name')}</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">
              {t('clients.phone', 'Phone')}{' '}
              <span className="text-xs text-muted-foreground">({t('common.optional', 'optional')})</span>
            </span>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('clients.kind', 'Role')}</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ClientKind)}
              className="flex h-10 w-full rounded-lg border border-input bg-card shadow-soft px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="buyer">{t('clients.kindBuyer', 'Buyer')}</option>
              <option value="seller">{t('clients.kindSeller', 'Seller')}</option>
              <option value="both">{t('clients.kindBoth', 'Both')}</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">
              {t('clients.notes', 'Notes')}{' '}
              <span className="text-xs text-muted-foreground">({t('common.optional', 'optional')})</span>
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="flex w-full rounded-lg border border-input bg-card shadow-soft px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
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
