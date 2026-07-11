import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Plus, Archive, ArchiveRestore, Pencil, Trash2, Check, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { toast } from '@renderer/components/ui/toast'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/store/settings'
import { formatCents, currencySymbol } from '@shared/accounting'
import { formatDate } from '@renderer/lib/date'
import type { MaterialDetailView, MaterialLineView } from '@shared/contracts'
import { MaterialLineDialog } from './MaterialLineDialog'
import { DeleteConfirmDialog } from '@renderer/components/DeleteConfirmDialog'

const kg = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 3 })
const LINE_GRID =
  'grid grid-cols-[100px_70px_minmax(120px,1fr)_90px_110px_120px_110px_44px] items-center gap-0 px-3 [&>*]:border-e [&>*]:border-border [&>*:last-child]:border-e-0 [&>*]:px-2 [&>*]:!text-center [&>*]:!justify-center'

export function MaterialDetail({
  materialId,
  onBack,
  onChanged
}: {
  materialId: number
  onBack: () => void
  onChanged: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const { calendar } = useSettings()
  const [material, setMaterial] = useState<MaterialDetailView | null>(null)
  const [lineDialog, setLineDialog] = useState<{ open: boolean; direction: 'buy' | 'sell' }>({
    open: false,
    direction: 'buy'
  })
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteLine, setDeleteLine] = useState<MaterialLineView | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setMaterial(await window.api.materials.get(materialId))
  }, [materialId])

  useEffect(() => {
    void load()
  }, [load])

  function refresh(): void {
    void load()
    onChanged()
  }

  async function toggleArchive(): Promise<void> {
    if (!material) return
    setBusy(true)
    try {
      if (material.archived) {
        await window.api.materials.restore(material.id)
        toast.success(t('common.restoredToast', 'Restored.'))
      } else {
        await window.api.materials.archive(material.id)
        toast.success(t('common.archivedToast', 'Archived.'))
      }
      refresh()
    } finally {
      setBusy(false)
    }
  }

  async function saveRename(): Promise<void> {
    if (!material || !newName.trim()) return
    setBusy(true)
    try {
      await window.api.materials.update(material.id, { name: newName.trim(), currency: material.currency })
      setRenaming(false)
      toast.success(t('common.saved', 'Saved.'))
      refresh()
    } finally {
      setBusy(false)
    }
  }

  async function doDeleteLot(): Promise<void> {
    if (!material) return
    setBusy(true)
    setDeleteError(null)
    try {
      const res = await window.api.materials.remove(material.id)
      if (!res.ok) {
        setDeleteError(
          t('material.deleteHasLines', 'This material has buy/sell lines and cannot be deleted. Archive it instead.')
        )
        return
      }
      setDeleteOpen(false)
      toast.success(t('common.deleted', 'Deleted.'))
      onChanged()
      onBack()
    } finally {
      setBusy(false)
    }
  }

  async function doDeleteLine(): Promise<void> {
    if (!deleteLine) return
    setBusy(true)
    try {
      await window.api.materials.removeLine(deleteLine.id)
      setDeleteLine(null)
      toast.success(t('common.deleted', 'Deleted.'))
      refresh()
    } finally {
      setBusy(false)
    }
  }

  if (!material) {
    return <div className="p-6 text-sm text-muted-foreground">{t('common.loading', 'Loading…')}</div>
  }

  const cur = material.currency
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            title={t('common.back', 'Back')}
            aria-label={t('common.back', 'Back')}
          >
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              {renaming ? (
                <>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveRename()}
                    className="h-9 w-56"
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={t('common.save', 'Save')}
                    aria-label={t('common.save', 'Save')}
                    onClick={saveRename}
                    disabled={busy || !newName.trim()}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={t('common.cancel', 'Cancel')}
                    aria-label={t('common.cancel', 'Cancel')}
                    onClick={() => setRenaming(false)}
                    disabled={busy}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold tracking-tight">{material.name}</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={t('common.rename', 'Rename')}
                    aria-label={t('common.rename', 'Rename')}
                    onClick={() => {
                      setNewName(material.name)
                      setRenaming(true)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </>
              )}
              <span className="rounded bg-accent px-2 py-0.5 text-xs text-accent-foreground">{currencySymbol(cur)}</span>
              {material.archived && (
                <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {t('clients.archivedBadge', 'Archived')}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setLineDialog({ open: true, direction: 'buy' })}>
            <Plus className="h-4 w-4" />
            {t('material.addBuy', 'Add buy')}
          </Button>
          <Button size="sm" onClick={() => setLineDialog({ open: true, direction: 'sell' })}>
            <Plus className="h-4 w-4" />
            {t('material.addSell', 'Add sell')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleArchive}
            disabled={busy}
            title={material.archived ? t('common.restore', 'Restore') : t('common.archive', 'Archive')}
            aria-label={material.archived ? t('common.restore', 'Restore') : t('common.archive', 'Archive')}
          >
            {material.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              setDeleteError(null)
              setDeleteOpen(true)
            }}
            disabled={busy}
          >
            <Trash2 className="h-4 w-4" />
            {t('common.delete', 'Delete')}
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('material.boughtKg', 'Bought (kg)')} value={kg(material.boughtKg)} />
        <Stat label={t('material.soldKg', 'Sold (kg)')} value={kg(material.soldKg)} />
        <Stat label={t('material.stock', 'Stock (kg)')} value={kg(material.stockKg)} strong />
        <Stat
          label={t('material.profit', 'Profit')}
          value={`${formatCents(material.profitCents)} ${currencySymbol(cur)}`}
          colorClass={
            material.profitCents > 0
              ? 'text-green-600 dark:text-green-400'
              : material.profitCents < 0
                ? 'text-red-600 dark:text-red-400'
                : ''
          }
        />
      </div>

      {/* Lines */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        <div className={cn(LINE_GRID, 'h-9 shrink-0 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground')}>
          <span>{t('material.date', 'Date')}</span>
          <span>{t('material.direction', 'Dir.')}</span>
          <span>{t('material.client', 'Client')}</span>
          <span className="text-end">{t('material.kilograms', 'kg')}</span>
          <span className="text-end">{t('material.pricePerKg', 'Price/kg')}</span>
          <span className="text-end">{t('material.lineTotal', 'Total')}</span>
          <span className="text-end">{t('material.lineProfit', 'Profit')}</span>
          <span />
        </div>
        <div className="flex-1 overflow-auto">
          {material.lines.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">{t('material.noLines', 'No lines yet.')}</div>
          )}
          {material.lines.map((l) => (
            <div key={l.id} className={cn(LINE_GRID, 'border-b border-border py-2 text-sm')}>
              <span className="text-muted-foreground">{formatDate(l.transactionDate, calendar)}</span>
              <span className={l.direction === 'buy' ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}>
                {l.direction === 'buy' ? t('material.buy', 'Buy') : t('material.sell', 'Sell')}
              </span>
              <span className="truncate">{l.clientName || t('common.none', '—')}</span>
              <span className="text-end font-mono tabular-nums">{kg(l.kilograms)}</span>
              <span className="text-end font-mono tabular-nums">{formatCents(l.pricePerKgCents)}</span>
              <span className="text-end font-mono tabular-nums">{formatCents(l.totalCents)}</span>
              <span
                className={cn(
                  'text-end font-mono tabular-nums',
                  l.lineProfitCents == null
                    ? 'text-muted-foreground'
                    : l.lineProfitCents > 0
                      ? 'text-green-600 dark:text-green-400'
                      : l.lineProfitCents < 0
                        ? 'text-red-600 dark:text-red-400'
                        : ''
                )}
              >
                {l.lineProfitCents == null ? '—' : formatCents(l.lineProfitCents)}
              </span>
              <span className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  title={t('common.delete', 'Delete')}
                  aria-label={t('common.delete', 'Delete')}
                  onClick={() => setDeleteLine(l)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </span>
            </div>
          ))}
        </div>
      </div>

      <MaterialLineDialog
        open={lineDialog.open}
        onOpenChange={(o) => setLineDialog((s) => ({ ...s, open: o }))}
        materialId={material.id}
        direction={lineDialog.direction}
        currency={cur}
        avgBuyPerKgCents={material.avgBuyPerKgCents}
        onSaved={refresh}
      />
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('material.deleteConfirmTitle', 'Delete this material?')}
        body={t('material.deleteConfirmBody', 'Only materials without any buy/sell lines can be deleted.')}
        expectedText={material.name}
        busy={busy}
        error={deleteError}
        onConfirm={doDeleteLot}
      />
      <DeleteConfirmDialog
        open={deleteLine !== null}
        onOpenChange={(o) => !o && setDeleteLine(null)}
        title={t('material.deleteLineConfirmTitle', 'Delete this line?')}
        body={t(
          'material.deleteLineConfirmBody',
          'A reversing transaction will be posted in the client account, and the line stops counting toward stock and profit.'
        )}
        expectedText={material.name}
        busy={busy}
        onConfirm={doDeleteLine}
      />
    </div>
  )
}

function Stat({
  label,
  value,
  strong,
  colorClass
}: {
  label: string
  value: string
  strong?: boolean
  colorClass?: string
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('font-mono tabular-nums', strong && 'text-lg font-semibold', colorClass)}>{value}</div>
    </div>
  )
}
