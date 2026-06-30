import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Pencil, Archive, ArchiveRestore, Tag } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/store/settings'
import { formatCents } from '@shared/accounting'
import { formatDate } from '@renderer/lib/date'
import type { CarpetDetailView, CarpetStatus } from '@shared/contracts'
import { statusLabelByKey } from './statusLabel'
import { CarpetFormDialog } from './CarpetFormDialog'
import { SellCarpetDialog } from './SellCarpetDialog'

export function CarpetDetail({
  carpetId,
  onBack,
  onChanged
}: {
  carpetId: number
  onBack: () => void
  onChanged: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const { calendar, language } = useSettings()
  const [carpet, setCarpet] = useState<CarpetDetailView | null>(null)
  const [statuses, setStatuses] = useState<CarpetStatus[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [sellOpen, setSellOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setCarpet(await window.api.carpets.get(carpetId))
    setStatuses(await window.api.carpetStatuses.list())
  }, [carpetId])

  useEffect(() => {
    void load()
  }, [load])

  function refresh(): void {
    void load()
    onChanged()
  }

  async function toggleArchive(): Promise<void> {
    if (!carpet) return
    setBusy(true)
    try {
      if (carpet.archived) {
        await window.api.carpets.restore(carpet.id)
        refresh()
      } else {
        const res = await window.api.carpets.archive(carpet.id)
        if (res.ok) refresh() // archive button is only shown for sold carpets
      }
    } finally {
      setBusy(false)
    }
  }

  if (!carpet) {
    return <div className="p-6 text-sm text-muted-foreground">{t('common.loading', 'Loading…')}</div>
  }

  const cur = carpet.currency
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} title={t('common.back', 'Back')}>
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{carpet.labelNumber}</h2>
              <span className="rounded bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                {statusLabelByKey(statuses, carpet.status, language)}
              </span>
              {carpet.archived && (
                <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {t('clients.archivedBadge', 'Archived')}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('carpets.createdAt', 'Added')}: {formatDate(carpet.createdAt, calendar)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!carpet.sold && !carpet.archived && (
            <Button size="sm" onClick={() => setSellOpen(true)}>
              <Tag className="h-4 w-4" />
              {t('sale.sellAction', 'Sell')}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            {t('common.edit', 'Edit')}
          </Button>
          {(carpet.archived || carpet.sold) && (
            <Button variant="outline" size="sm" onClick={toggleArchive} disabled={busy}>
              {carpet.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              {carpet.archived ? t('common.restore', 'Restore') : t('common.archive', 'Archive')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Attributes */}
        <Card title={t('carpets.title', 'Carpet')}>
          <Row label={t('carpets.length', 'Length')} value={`${carpet.length} m`} />
          <Row label={t('carpets.width', 'Width')} value={`${carpet.width} m`} />
          <Row label={t('carpets.area', 'Area')} value={`${carpet.area.toFixed(2)} m²`} />
          <Row label={t('carpets.sortGrade', 'Sort grade')} value={carpet.sortGrade || t('common.none', '—')} />
          <Row label={t('carpets.currency', 'Currency')} value={cur} />
        </Card>

        {/* Buy info */}
        <Card title={t('carpets.buyInfo', 'Purchase')}>
          <Row label={t('carpets.boughtFrom', 'Bought from')} value={carpet.boughtFromName || t('common.none', '—')} />
          <Row label={t('carpets.pricePerMeter', 'Price/m')} value={`${formatCents(carpet.pricePerMeterCents)} ${cur}`} mono />
          <Row label={t('carpets.deduction', 'Deduction')} value={`${formatCents(carpet.sortDeductionCents)} ${cur}`} mono />
          <Row label={t('carpets.totalPrice', 'Total')} value={`${formatCents(carpet.totalPriceCents)} ${cur}`} mono strong />
        </Card>

        {/* Sell info / profit */}
        <Card title={t('carpets.sellInfo', 'Sale')}>
          {carpet.sold ? (
            <>
              <Row label={t('carpets.soldTo', 'Sold to')} value={carpet.soldToName || t('common.none', '—')} />
              <Row
                label={t('carpets.pricePerMeter', 'Price/m')}
                value={`${formatCents(carpet.sellPricePerMeterCents ?? 0)} ${cur}`}
                mono
              />
              <Row
                label={t('carpets.deduction', 'Deduction')}
                value={`${formatCents(carpet.sellSortDeductionCents ?? 0)} ${cur}`}
                mono
              />
              <Row label={t('carpets.totalPrice', 'Total')} value={`${formatCents(carpet.sellTotalPriceCents ?? 0)} ${cur}`} mono />
              {carpet.soldAt != null && (
                <Row label={t('statement.date', 'Date')} value={formatDate(carpet.soldAt, calendar)} />
              )}
              <div className="mt-2 border-t border-border pt-2">
                <Row
                  label={t('carpets.profit', 'Profit')}
                  value={`${formatCents(carpet.profitCents ?? 0)} ${cur}`}
                  mono
                  strong
                  valueClassName={
                    (carpet.profitCents ?? 0) > 0
                      ? 'text-green-600 dark:text-green-400'
                      : (carpet.profitCents ?? 0) < 0
                        ? 'text-red-600 dark:text-red-400'
                        : ''
                  }
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('carpets.notSold', 'Not sold yet.')}</p>
          )}
        </Card>
      </div>

      <CarpetFormDialog open={editOpen} onOpenChange={setEditOpen} carpet={carpet} onSaved={refresh} />
      <SellCarpetDialog open={sellOpen} onOpenChange={setSellOpen} carpet={carpet} onSold={refresh} />
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Row({
  label,
  value,
  mono,
  strong,
  valueClassName
}: {
  label: string
  value: string
  mono?: boolean
  strong?: boolean
  valueClassName?: string
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(mono && 'font-mono tabular-nums', strong && 'font-semibold', valueClassName)}>{value}</span>
    </div>
  )
}
