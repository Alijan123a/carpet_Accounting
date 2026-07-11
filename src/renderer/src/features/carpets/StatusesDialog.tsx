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
import { toast } from '@renderer/components/ui/toast'
import type { CarpetStatus } from '@shared/contracts'
import { useSettings } from '@renderer/store/settings'
import { DeleteConfirmDialog } from '@renderer/components/DeleteConfirmDialog'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}

export function StatusesDialog({ open, onOpenChange, onChanged }: Props): JSX.Element {
  const { t } = useTranslation()
  const language = useSettings((s) => s.language)
  const [rows, setRows] = useState<CarpetStatus[]>([])
  const [newFa, setNewFa] = useState('')
  const [newEn, setNewEn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CarpetStatus | null>(null)

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
    toast.success(t('common.saved', 'Saved.'))
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
            : (res.reason ?? t('common.error', 'An error occurred.'))
      )
      setDeleteTarget(null)
      return
    }
    setDeleteTarget(null)
    toast.success(t('common.deleted', 'Deleted.'))
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
      setError(res.reason ?? t('common.error', 'An error occurred.'))
      return
    }
    setNewFa('')
    setNewEn('')
    toast.success(t('common.saved', 'Saved.'))
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
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={t('common.save', 'Save')}
                aria-label={t('common.save', 'Save')}
                onClick={() => rename(s)}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={
                  s.isDefault
                    ? t('statusMgr.cannotDeleteDefault', 'Default statuses cannot be deleted.')
                    : t('common.delete', 'Delete')
                }
                aria-label={t('common.delete', 'Delete')}
                disabled={s.isDefault}
                onClick={() => setDeleteTarget(s)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-end gap-2 border-t border-border pt-3">
          <label className="flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">{t('statusMgr.labelFa', 'Label (Dari)')}</span>
            <Input
              value={newFa}
              onChange={(e) => setNewFa(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              className="h-9"
            />
          </label>
          <label className="flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">{t('statusMgr.labelEn', 'Label (English)')}</span>
            <Input
              value={newEn}
              onChange={(e) => setNewEn(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              className="h-9"
            />
          </label>
          <Button onClick={add}>
            <Plus className="h-4 w-4" />
            {t('statusMgr.add', 'Add')}
          </Button>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DeleteConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          title={t('statusMgr.deleteConfirmTitle', 'Delete this status?')}
          body={t('statusMgr.deleteConfirmBody', 'Statuses that are in use cannot be deleted.')}
          expectedText={deleteTarget ? (language === 'fa' ? deleteTarget.labelFa : deleteTarget.labelEn) : ''}
          onConfirm={() => deleteTarget && void remove(deleteTarget)}
        />
      </DialogContent>
    </Dialog>
  )
}
