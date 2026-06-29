import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, Check, Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import type { CarpetStatus } from '@shared/contracts'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}

export function StatusesDialog({ open, onOpenChange, onChanged }: Props): JSX.Element {
  const { t } = useTranslation()
  const [rows, setRows] = useState<CarpetStatus[]>([])
  const [newFa, setNewFa] = useState('')
  const [newEn, setNewEn] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reload = async (): Promise<void> => {
    setRows(await window.api.carpetStatuses.list())
    onChanged()
  }

  useEffect(() => {
    if (open) {
      setError(null)
      setNewFa('')
      setNewEn('')
      void reload()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function setRow(id: number, patch: Partial<CarpetStatus>): void {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  async function rename(s: CarpetStatus): Promise<void> {
    await window.api.carpetStatuses.rename(s.id, { labelFa: s.labelFa, labelEn: s.labelEn })
    void reload()
  }

  async function remove(s: CarpetStatus): Promise<void> {
    setError(null)
    const res = await window.api.carpetStatuses.remove(s.id)
    if (!res.ok) {
      setError(
        res.reason === 'default'
          ? t('statusMgr.cannotDeleteDefault', 'Default statuses cannot be deleted.')
          : res.reason === 'in_use'
            ? t('statusMgr.inUse', 'This status is in use.')
            : (res.reason ?? 'error')
      )
      return
    }
    void reload()
  }

  async function add(): Promise<void> {
    setError(null)
    if (!newFa.trim() || !newEn.trim()) {
      setError(t('statusMgr.labelsRequired', 'Both labels are required.'))
      return
    }
    const res = await window.api.carpetStatuses.create({ labelFa: newFa.trim(), labelEn: newEn.trim() })
    if (!res.ok) {
      setError(res.reason ?? 'error')
      return
    }
    setNewFa('')
    setNewEn('')
    void reload()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('statusMgr.title', 'Carpet statuses')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {rows.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <Input value={s.labelFa} onChange={(e) => setRow(s.id, { labelFa: e.target.value })} className="h-9" />
              <Input value={s.labelEn} onChange={(e) => setRow(s.id, { labelEn: e.target.value })} className="h-9" />
              {s.isDefault && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {t('statusMgr.defaultBadge', 'default')}
                </span>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" title={t('common.save', 'Save')} onClick={() => rename(s)}>
                <Check className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={t('common.delete', 'Delete')}
                disabled={s.isDefault}
                onClick={() => remove(s)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-end gap-2 border-t border-border pt-3">
          <label className="flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">{t('statusMgr.labelFa', 'Label (Dari)')}</span>
            <Input value={newFa} onChange={(e) => setNewFa(e.target.value)} className="h-9" />
          </label>
          <label className="flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">{t('statusMgr.labelEn', 'Label (English)')}</span>
            <Input value={newEn} onChange={(e) => setNewEn(e.target.value)} className="h-9" />
          </label>
          <Button onClick={add}>
            <Plus className="h-4 w-4" />
            {t('statusMgr.add', 'Add')}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
