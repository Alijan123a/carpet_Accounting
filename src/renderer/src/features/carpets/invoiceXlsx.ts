import * as XLSX from 'xlsx'
import { formatDate } from '@renderer/lib/date'
import { formatCents, currencySymbol } from '@shared/accounting'
import { BUSINESS_INFO, type InvoiceDocData } from './SellInvoicePdf'

/**
 * Render a sell invoice («بل فروش») as an .xlsx workbook — the same content as
 * the printed PDF (header, line grid, grand total), for users who want to keep
 * working with the numbers. Money cells hold plain major-unit numbers so Excel
 * can sum them; display-only strings keep the currency symbol.
 */
export function buildInvoiceXlsx(doc: InvoiceDocData): Uint8Array {
  const sym = currencySymbol(doc.currency)
  const toMajor = (cents: number): number => Number((cents / 100).toFixed(2))

  const aoa: (string | number)[][] = [
    [BUSINESS_INFO.name],
    [`بل فروش — ${doc.number}`],
    [
      `اسم مشتری: ${doc.buyerName}${doc.buyerPhone ? ` · ${doc.buyerPhone}` : ''}`,
      '',
      `تاریخ: ${formatDate(doc.dateEpoch, doc.calendar)}`
    ],
    [],
    ['شماره', 'نوع جنس', 'تفصیل', 'نمبر قالین', 'طول', 'عرض', 'متر', `قیمت (${sym})`, `جمله نقد (${sym})`],
    ...doc.lines.map((l, i): (string | number)[] => [
      i + 1,
      l.goodsType,
      l.description ?? '',
      l.labelNumber,
      l.length || '',
      l.width || '',
      l.area ? Number(l.area.toFixed(2)) : '',
      toMajor(l.unitPriceCents),
      toMajor(l.totalCents)
    ]),
    [],
    ['', '', '', '', '', '', '', 'مجموع کل', `${formatCents(doc.grandTotalCents)} ${sym}`]
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 7 },
    { wch: 14 },
    { wch: 24 },
    { wch: 14 },
    { wch: 8 },
    { wch: 8 },
    { wch: 9 },
    { wch: 13 },
    { wch: 16 }
  ]

  const wb = XLSX.utils.book_new()
  // Mirror the app's reading direction in the sheet view.
  if (doc.direction === 'rtl') wb.Workbook = { Views: [{ RTL: true }] }
  XLSX.utils.book_append_sheet(wb, ws, 'بل فروش')

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new Uint8Array(out)
}
