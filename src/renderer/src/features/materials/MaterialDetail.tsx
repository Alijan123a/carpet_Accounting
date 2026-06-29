import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Plus, Archive, ArchiveRestore } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/store/settings'
import { formatCents } from '@shared/accounting'
import { formatDate } from '@renderer/lib/date'
import type { MaterialDetailView } from '@shared/contracts'
import { MaterialLineDialog } from './MaterialLineDialog'

const kg = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 3 })
const LINE_GRID = 'grid grid-cols-[100px_70px_minmax(120px,1fr)_90px_110px_120px_110px] items-center gap-3 px-3'

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
      if (material.archived) await window.api.materials.restore(material.id)
      else await window.api.materials.archive(material.id)
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
          <Button variant="ghost" size="icon" onClick={onBack} title={t('common.back', 'Back')}>
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{material.name}</h2>
              <span className="rounded bg-accent px-2 py-0.5 text-xs text-accent-foreground">{cur}</span>
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
          <Button variant="outline" size="sm" onClick={toggleArchive} disabled={busy}>
            {material.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
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
          value={`${formatCents(material.profitCents)} ${cur}`}
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
        <div className={cn(LINE_GRID, 'h-9 shrink-0 border-b border-border bg-card text-xs font-medium text-muted-foreground')}>
          <span>{t('material.date', 'Date')}</span>
          <span>{t('material.direction', 'Dir.')}</span>
          <span>{t('material.client', 'Client')}</span>
          <span className="text-end">{t('material.kilograms', 'kg')}</span>
          <span className="text-end">{t('material.pricePerKg', 'Price/kg')}</span>
          <span className="text-end">{t('material.lineTotal', 'Total')}</span>
          <span className="text-end">{t('material.lineProfit', 'Profit')}</span>
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
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('font-mono tabular-nums', strong && 'text-lg font-semibold', colorClass)}>{value}</div>
    </div>
  )
}
