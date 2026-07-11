import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, Check, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { toast } from '@renderer/components/ui/toast'
import { DeleteConfirmDialog } from '@renderer/components/DeleteConfirmDialog'
import type { ExpenseType } from '@shared/contracts'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}

/**
 * Manage the user's expense categories («انواع مصارف»): add, rename, delete.
 * A rename cascades to existing expenses; a type still used by any expense
 * cannot be deleted (server enforces the 'in_use' guard).
 */
export function ExpenseTypesDialog({ open, onOpenChange, onChanged }: Props): JSX.Element {
  const { t } = useTranslation()
  const [rows, setRows] = useState<ExpenseType[]>([])
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ExpenseType | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const reload = async (): Promise<void> => {
    setRows(await window.api.expenseTypes.list())
    onChanged()
  }

  useEffect(() => {
    if (open) {
      setError(null)
      setNewName('')
      void reload()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function setRow(id: number, name: string): void {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, name } : r)))
  }

  async function rename(ty: ExpenseType): Promise<void> {
    setError(null)
    const res = await window.api.expenseTypes.rename(ty.id, { name: ty.name })
    if (!res.ok) {
      setError(
        res.reason === 'duplicate'
          ? t('expenseTypes.duplicate', 'A type with this name already exists.')
          : t('common.error', 'An error occurred.')
      )
      return
    }
    toast.success(t('common.saved', 'Saved.'))
    void reload()
  }

  async function remove(ty: ExpenseType): Promise<void> {
    setDeleteError(null)
    const res = await window.api.expenseTypes.remove(ty.id)
    if (!res.ok) {
      setDeleteError(
        res.reason === 'in_use'
          ? t('expenseTypes.inUse', 'This type is in use by one or more expenses.')
          : t('common.error', 'An error occurred.')
      )
      return
    }
    setDeleteTarget(null)
    toast.success(t('common.deleted', 'Deleted.'))
    void reload()
  }

  async function add(): Promise<void> {
    setError(null)
    if (!newName.trim()) {
      setError(t('expenseTypes.nameRequired', 'Name is required.'))
      return
    }
    const res = await window.api.expenseTypes.create({ name: newName.trim() })
    if (!res.ok) {
      setError(
        res.reason === 'duplicate'
          ? t('expenseTypes.duplicate', 'A type with this name already exists.')
          : t('common.error', 'An error occurred.')
      )
      return
    }
    setNewName('')
    toast.success(t('common.saved', 'Saved.'))
    void reload()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('expenseTypes.title', 'Expense types')}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {rows.length === 0 && (
            <p className="py-2 text-center text-sm text-muted-foreground">{t('expenseTypes.empty', 'No types yet.')}</p>
          )}
          {rows.map((ty) => (
            <div key={ty.id} className="flex items-center gap-2">
              <Input
                value={ty.name}
                onChange={(e) => setRow(ty.id, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && rename(ty)}
                className="h-9"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={t('common.save', 'Save')}
                aria-label={t('common.save', 'Save')}
                onClick={() => rename(ty)}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                title={t('common.delete', 'Delete')}
                aria-label={t('common.delete', 'Delete')}
                onClick={() => {
                  setDeleteError(null)
                  setDeleteTarget(ty)
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-end gap-2 border-t border-border pt-3">
          <label className="flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">{t('expenseTypes.name', 'Name')}</span>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              className="h-9"
            />
          </label>
          <Button onClick={add}>
            <Plus className="h-4 w-4" />
            {t('common.add', 'Add')}
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
          title={t('expenseTypes.deleteConfirmTitle', 'Delete this type?')}
          body={t('expenseTypes.deleteConfirmBody', 'Types in use by an expense cannot be deleted.')}
          expectedText={deleteTarget?.name ?? ''}
          error={deleteError}
          onConfirm={() => deleteTarget && void remove(deleteTarget)}
        />
      </DialogContent>
    </Dialog>
  )
}
