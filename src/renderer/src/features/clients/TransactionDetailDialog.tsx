import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { useSettings } from '@renderer/store/settings'
import { formatDate, formatDateTime } from '@renderer/lib/date'
import type { TransactionView } from '@shared/contracts'
import { BalanceAmount } from './BalanceAmount'

/**
 * Read-only popup showing every field of a single ledger transaction.
 * Opened by double-clicking a row in the client statement. The ledger is
 * immutable (CLAUDE.md §3), so this view never edits — it only displays.
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

  const linked = tx?.carpetLabel
    ? `${t('statement.carpet', 'Carpet')} ${tx.carpetLabel}`
    : tx?.materialName
      ? `${t('statement.material', 'Material')}: ${tx.materialName}`
      : t('common.none', '—')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('txDetail.title', 'Transaction details')}</DialogTitle>
        </DialogHeader>

        {tx && (
          <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-sm">
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
            <Row label={t('statement.linked', 'Linked')}>{linked}</Row>
            {tx.reversesTransactionId != null && (
              <Row label={t('txDetail.reverses', 'Reverses')}>#{tx.reversesTransactionId}</Row>
            )}
            <Row label={t('statement.note', 'Note')}>
              <span className="whitespace-pre-wrap break-words">{tx.note || t('common.none', '—')}</span>
            </Row>
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
