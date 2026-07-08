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
import { Typeahead } from '@renderer/components/ui/typeahead'
import type { ClientListItem } from '@shared/contracts'

/**
 * Pick a seller (weaver) to hand the selected carpets to. On confirm the caller
 * marks those items «در حال کار» and records the seller name on each.
 */
export function AssignSellerDialog({
  open,
  onOpenChange,
  count,
  onAssign
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  count: number
  onAssign: (seller: ClientListItem) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [sellers, setSellers] = useState<ClientListItem[]>([])
  const [query, setQuery] = useState('')
  const [seller, setSeller] = useState<ClientListItem | null>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSeller(null)
    void window.api.clients
      .list({ kind: 'seller', includeArchived: false, limit: 1000, offset: 0 })
      .then((r) => setSellers(r.rows))
  }, [open])

  const items = useMemo(
    () => sellers.map((s) => ({ id: s.id, label: s.name, sublabel: s.phone ?? undefined })),
    [sellers]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('orders.assignSeller', 'Assign to seller')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t('orders.assignSellerBody', {
            count,
            defaultValue: 'Hand {{count}} carpet(s) to a seller to make. They will be marked «On work».'
          })}
        </p>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{t('orders.seller', 'Seller')}</span>
          <Typeahead
            value={query}
            onValueChange={(v) => {
              setQuery(v)
              setSeller(null)
            }}
            items={items}
            onSelect={(it) => {
              const s = sellers.find((x) => x.id === it.id) ?? null
              setSeller(s)
              setQuery(s?.name ?? '')
            }}
            placeholder={t('orders.sellerPlaceholder', 'Type a seller name…')}
          />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            disabled={!seller}
            onClick={() => {
              if (seller) onAssign(seller)
            }}
          >
            {t('orders.assign', 'Assign')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
