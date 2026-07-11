import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Printer, FileText, FileSpreadsheet } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { toast } from '@renderer/components/ui/toast'
import { generateInvoicePdf, type InvoiceDocData } from './SellInvoicePdf'
import { buildInvoiceXlsx } from './invoiceXlsx'

type Kind = 'print' | 'pdf' | 'excel'

/**
 * Post-save chooser for a sell invoice: the bill is ALREADY saved when this
 * opens — the user only picks what to do with the document (print it, export
 * PDF, export Excel). Any number of exports can be run before closing.
 */
export function InvoiceExportDialog({
  doc,
  onClose
}: {
  /** Non-null opens the dialog. */
  doc: InvoiceDocData | null
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<Kind | null>(null)

  async function run(kind: Kind): Promise<void> {
    if (!doc || busy) return
    setBusy(kind)
    try {
      if (kind === 'print') {
        const bytes = await generateInvoicePdf(doc)
        const res = await window.api.pdf.print(`invoice-${doc.number}.pdf`, bytes)
        if (!res.ok && res.opened) {
          // Print verb unavailable — the PDF was opened so the user can print from the viewer.
          toast.success(t('invoice.printFallback', 'Opened the bill — use your PDF viewer to print.'))
        } else if (!res.ok) {
          toast.error(t('invoice.printFailed', 'Could not print the bill.'))
        }
      } else if (kind === 'pdf') {
        const bytes = await generateInvoicePdf(doc)
        const res = await window.api.pdf.save(`invoice-${doc.number}.pdf`, bytes)
        if (res.ok) toast.success(t('invoice.exported', 'Exported.'))
      } else {
        const bytes = buildInvoiceXlsx(doc)
        const res = await window.api.files.save(`invoice-${doc.number}.xlsx`, bytes, 'Excel', ['xlsx'])
        if (res.ok) toast.success(t('invoice.exported', 'Exported.'))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={doc != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('invoice.exportTitle', 'Bill saved')}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {t('invoice.exportPrompt', 'Print the bill or export it as a file:')}
        </p>

        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => run('print')} busy={busy === 'print'}>
            <Printer className="h-6 w-6" />
            {t('invoice.print', 'Print')}
          </Button>
          <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => run('pdf')} busy={busy === 'pdf'}>
            <FileText className="h-6 w-6" />
            {t('invoice.exportPdf', 'PDF')}
          </Button>
          <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => run('excel')} busy={busy === 'excel'}>
            <FileSpreadsheet className="h-6 w-6" />
            {t('invoice.exportExcel', 'Excel')}
          </Button>
        </div>

        <DialogFooter>
          <Button onClick={onClose} disabled={busy != null}>
            {t('invoice.exportDone', 'Done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
