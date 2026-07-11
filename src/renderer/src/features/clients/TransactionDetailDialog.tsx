import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { useSettings } from '@renderer/store/settings'
import { formatDate, formatDateTime } from '@renderer/lib/date'
import { formatCents } from '@shared/accounting'
import type { TransactionView, CarpetDetailView } from '@shared/contracts'
import { BalanceAmount } from './BalanceAmount'

/**
 * Read-only popup showing every field of a single ledger transaction — the
 * statement table only shows the essentials, everything else lives here.
 * Opened by double-clicking a row. When the transaction is linked to a carpet,
 * the carpet's dimensions and pricing (length, width, متراژ, فی متر…) are
 * loaded and shown too. The ledger is immutable (CLAUDE.md §3), so this view
 * never edits — it only displays.
 */
export function TransactionDetailDialog({
  tx,
  open,
  onOpenChange
}: {
  tx: TransactionView | null
  open: boolean
  onOpenChange: (open: boolean) => void
}): JSX.Element {
  const { t } = useTranslation()
  const calendar = useSettings((s) => s.calendar)
  const [carpet, setCarpet] = useState<CarpetDetailView | null>(null)

  useEffect(() => {
    setCarpet(null)
    if (open && tx?.carpetId != null) {
      void window.api.carpets.get(tx.carpetId).then(setCarpet)
    }
  }, [open, tx])

  // For a sale row show the sell-side pricing; otherwise the buy side.
  const isSale = tx?.type === 'sale'
  const ppmCents = carpet ? (isSale ? carpet.sellPricePerMeterCents : carpet.pricePerMeterCents) : null
  const deductionCents = carpet ? (isSale ? carpet.sellSortDeductionCents : carpet.sortDeductionCents) : null
  const totalCents = carpet ? (isSale ? carpet.sellTotalPriceCents : carpet.totalPriceCents) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('txDetail.title', 'Transaction details')}</DialogTitle>
        </DialogHeader>

        {tx && (
          <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-3 text-sm">
            <Row label={t('txDetail.id', 'ID')}>#{tx.id}</Row>
            <Row label={t('statement.type', 'Type')}>{t(`tx.type.${tx.type}`, tx.type)}</Row>
            <Row label={t('statement.currency', 'Currency')}>{tx.currency}</Row>
            <Row label={t('statement.amount', 'Amount')}>
              <BalanceAmount cents={tx.amountCents} />
            </Row>
            <Row label={t('txDetail.transactionDate', 'Transaction date')}>
              {formatDate(tx.transactionDate, calendar)}
            </Row>
            <Row label={t('txDetail.createdAt', 'Recorded at')}>
              {formatDateTime(tx.createdAt, calendar)}
            </Row>
            {tx.invoiceNumber && <Row label={t('statement.billNo', 'Bill #')}>{tx.invoiceNumber}</Row>}
            {tx.materialName && (
              <Row label={t('statement.material', 'Material')}>{tx.materialName}</Row>
            )}
            {tx.reversesTransactionId != null && (
              <Row label={t('txDetail.reverses', 'Reverses')}>#{tx.reversesTransactionId}</Row>
            )}
            <Row label={t('statement.description', 'Description')}>
              <span className="whitespace-pre-wrap break-words">{tx.note || t('common.none', '—')}</span>
            </Row>

            {tx.carpetId != null && !carpet && (
              <dt className="col-span-2 mt-1 border-t border-border pt-3 text-xs text-muted-foreground">
                {t('common.loading', 'Loading…')}
              </dt>
            )}
            {carpet && (
              <>
                <dt className="col-span-2 mt-1 border-t border-border pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('txDetail.carpetSection', 'Carpet')}
                </dt>
                <Row label={t('statement.carpetNo', 'Carpet #')}>{carpet.labelNumber}</Row>
                <Row label={t('carpets.length', 'Length')}>{carpet.length} m</Row>
                <Row label={t('carpets.width', 'Width')}>{carpet.width} m</Row>
                <Row label={t('carpets.area', 'Area (متراژ)')}>{carpet.area.toFixed(2)} m²</Row>
                {carpet.sortGrade && <Row label={t('carpets.sortGrade', 'Grade')}>{carpet.sortGrade}</Row>}
                {carpet.quality && <Row label={t('carpets.quality', 'Quality')}>{carpet.quality}</Row>}
                {ppmCents != null && (
                  <Row label={t('txDetail.pricePerMeter', 'Price / m (فی متر)')}>
                    <span className="font-mono tabular-nums">
                      {formatCents(ppmCents)} {carpet.currency}
                    </span>
                  </Row>
                )}
                {deductionCents != null && deductionCents !== 0 && (
                  <Row label={t('carpets.deduction', 'Deduction')}>
                    <span className="font-mono tabular-nums">
                      {formatCents(deductionCents)} {carpet.currency}
                    </span>
                  </Row>
                )}
                {totalCents != null && (
                  <Row label={t('statement.totalPrice', 'Total price')}>
                    <span className="font-mono tabular-nums">
                      {formatCents(totalCents)} {carpet.currency}
                    </span>
                  </Row>
                )}
              </>
            )}
          </dl>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{children}</dd>
    </>
  )
}
