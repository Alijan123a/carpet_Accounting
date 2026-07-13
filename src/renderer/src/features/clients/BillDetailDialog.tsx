import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileOutput } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { useSettings } from '@renderer/store/settings'
import { formatDate } from '@renderer/lib/date'
import { formatCents, formatCentsCompact, currencySymbol } from '@shared/accounting'
import type { InvoiceDetailView } from '@shared/contracts'
import type { InvoiceDocData } from '@renderer/features/carpets/SellInvoicePdf'
import { InvoiceExportDialog } from '@renderer/features/carpets/InvoiceExportDialog'

/**
 * Read-only detail of ONE sell invoice (bill) opened by double-clicking a buyer
 * bills row. Loads the stored snapshot (lines of record) and shows every carpet
 * line with its متراژ / فی متر / جمله. The «Export» button opens the same
 * print / PDF / Excel chooser used right after a bill is saved.
 */
export function BillDetailDialog({
  invoiceId,
  open,
  onOpenChange
}: {
  invoiceId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}): JSX.Element {
  const { t } = useTranslation()
  const language = useSettings((s) => s.language)
  const calendar = useSettings((s) => s.calendar)

  const [bill, setBill] = useState<InvoiceDetailView | null>(null)
  const [loading, setLoading] = useState(false)
  /** Non-null opens the print/PDF/Excel chooser layered over this dialog. */
  const [exportDoc, setExportDoc] = useState<InvoiceDocData | null>(null)

  useEffect(() => {
    if (!open || invoiceId == null) {
      setBill(null)
      return
    }
    setLoading(true)
    void window.api.invoices
      .get(invoiceId)
      .then(setBill)
      .finally(() => setLoading(false))
  }, [open, invoiceId])

  const doc = useMemo<InvoiceDocData | null>(() => {
    if (!bill) return null
    return {
      number: bill.number,
      dateEpoch: bill.transactionDate,
      buyerName: bill.buyerName,
      buyerPhone: bill.buyerPhone,
      currency: bill.currency,
      lines: bill.lines.map((l) => ({
        goodsType: l.goodsType,
        description: l.description,
        labelNumber: l.labelNumber,
        length: l.length,
        width: l.width,
        area: l.area,
        unitPriceCents: l.unitPriceCents,
        totalCents: l.totalCents
      })),
      grandTotalCents: bill.totalCents,
      direction: language === 'fa' ? 'rtl' : 'ltr',
      calendar
    }
  }, [bill, language, calendar])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('bills.detailTitle', 'Bill #{{number}}', { number: bill?.number ?? '' })}
          </DialogTitle>
        </DialogHeader>

        {loading && !bill && (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('common.loading', 'Loading…')}</p>
        )}

        {bill && (
          <>
            {/* Bill header: buyer / date / currency */}
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Field label={t('bills.buyer', 'Buyer')}>{bill.buyerName}</Field>
              <Field label={t('bills.date', 'Date')}>{formatDate(bill.transactionDate, calendar)}</Field>
              <Field label={t('bills.currency', 'Currency')}>{currencySymbol(bill.currency)}</Field>
              <Field label={t('bills.carpets', 'Carpets')}>{bill.lines.length}</Field>
            </div>

            {/* Line grid */}
            <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-card">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-[minmax(110px,1.4fr)_70px_70px_80px_110px_120px] items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground [&>span]:text-center">
                  <span>{t('bills.carpetNo', 'Carpet #')}</span>
                  <span className="text-end">{t('carpets.length', 'L')}</span>
                  <span className="text-end">{t('carpets.width', 'W')}</span>
                  <span className="text-end">{t('bills.area', 'Area')}</span>
                  <span className="text-end">{t('bills.unitPrice', 'Price/m')}</span>
                  <span className="text-end">{t('bills.lineTotal', 'Total')}</span>
                </div>
                <div className="max-h-[46vh] overflow-y-auto">
                  {bill.lines.map((l, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[minmax(110px,1.4fr)_70px_70px_80px_110px_120px] items-center gap-2 border-b border-border px-3 py-1.5 text-sm [&>span]:text-center"
                    >
                      <span className="truncate">
                        {l.labelNumber || l.goodsType || t('common.none', '—')}
                        {l.description && (
                          <span className="ms-1 text-xs text-muted-foreground">— {l.description}</span>
                        )}
                      </span>
                      <span className="text-end font-mono tabular-nums text-muted-foreground">{l.length}</span>
                      <span className="text-end font-mono tabular-nums text-muted-foreground">{l.width}</span>
                      <span className="text-end font-mono tabular-nums">{l.area.toFixed(2)}</span>
                      <span className="text-end font-mono tabular-nums">{formatCents(l.unitPriceCents)}</span>
                      <span className="text-end font-mono tabular-nums">{formatCents(l.totalCents)}</span>
                    </div>
                  ))}
                </div>

                {/* Totals footer */}
                <div className="flex items-center justify-end gap-6 px-3 py-2 text-sm">
                  <span>
                    <span className="text-muted-foreground">{t('bills.totalSqm', 'Total SQM')}: </span>
                    <span className="font-mono text-base font-semibold tabular-nums">{bill.totalSqm.toFixed(2)}</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">{t('bills.grandTotal', 'Grand total')}: </span>
                    <span className="font-mono text-base font-semibold tabular-nums">
                      {formatCentsCompact(bill.totalCents)} {currencySymbol(bill.currency)}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close', 'Close')}
          </Button>
          <Button disabled={!doc} onClick={() => setExportDoc(doc)}>
            <FileOutput className="h-4 w-4" />
            {t('bills.export', 'Export / Print')}
          </Button>
        </DialogFooter>

        {/* Print / PDF / Excel chooser, layered over the detail. */}
        <InvoiceExportDialog doc={exportDoc} onClose={() => setExportDoc(null)} />
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium text-foreground">{children}</div>
    </div>
  )
}
