import { Document, Page, View, Text, StyleSheet, Font, pdf } from '@react-pdf/renderer'
import { VAZIR_REGULAR_DATA_URI, VAZIR_BOLD_DATA_URI } from '@renderer/features/reports/fontData'
import { formatDate } from '@renderer/lib/date'
import { formatCents } from '@shared/accounting'
import type { Currency } from '@shared/accounting'
import type { Calendar } from '@renderer/store/settings'

// Same embedded-font approach as ReportPdf: Vazirmatn covers Latin + Persian, is
// registered from base64 data URIs (works under file://), and fontkit shapes the
// Arabic/Persian glyphs; document `direction` handles RTL ordering.
Font.register({
  family: 'Vazirmatn',
  fonts: [
    { src: VAZIR_REGULAR_DATA_URI, fontWeight: 'normal' },
    { src: VAZIR_BOLD_DATA_URI, fontWeight: 'bold' }
  ]
})

/**
 * Business identity printed on the invoice header. There is no settings field
 * for this yet, so it lives here as a clearly-marked EDITABLE constant — change
 * these values (or wire them to app config later) to match the real shop.
 */
export const BUSINESS_INFO = {
  name: 'تجارتخانه قالین',
  phones: '0700 000 000 · 0780 000 000'
}

/** Brand accent (laaki red) used for header + table lines. */
const BRAND = '#9b1c1c'

export interface InvoiceDocLine {
  goodsType: string
  labelNumber: string
  length: number
  width: number
  area: number
  unitPriceCents: number
  totalCents: number
}

export interface InvoiceDocData {
  number: string
  dateEpoch: number
  buyerName: string
  buyerPhone: string | null
  currency: Currency
  lines: InvoiceDocLine[]
  grandTotalCents: number
  direction: 'rtl' | 'ltr'
  calendar: Calendar
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 30, paddingVertical: 28, fontSize: 9, fontFamily: 'Vazirmatn', color: '#111' },
  headerBox: {
    borderBottomWidth: 2,
    borderBottomColor: BRAND,
    paddingBottom: 8,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  bizName: { fontSize: 16, fontWeight: 'bold', color: BRAND, marginBottom: 2 },
  bizPhones: { fontSize: 8, color: '#555' },
  invMeta: { fontSize: 9 },
  invTitle: { fontSize: 13, fontWeight: 'bold', marginBottom: 3 },
  buyerBox: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 6,
    marginBottom: 10
  },
  buyerLabel: { fontSize: 8, color: '#888' },
  buyerName: { fontSize: 11, fontWeight: 'bold' },
  table: { borderWidth: 1, borderColor: '#bbb' },
  headerRow: { flexDirection: 'row', backgroundColor: '#f3e6e6', borderBottomWidth: 1, borderBottomColor: BRAND },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ddd' },
  totalRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: BRAND, backgroundColor: '#faf5f5' },
  cell: { paddingVertical: 3, paddingHorizontal: 4 },
  cellBold: { paddingVertical: 4, paddingHorizontal: 4, fontWeight: 'bold' },
  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 36 },
  signBox: { width: '42%', borderTopWidth: 1, borderTopColor: '#333', paddingTop: 4, textAlign: 'center', fontSize: 9 }
})

// Column widths (flex) — DOM order is fixed; the page `direction` flips it for RTL.
const COLS = {
  index: 0.5,
  goods: 1.4,
  label: 1.6,
  length: 0.9,
  width: 0.9,
  area: 1,
  price: 1.4,
  total: 1.5
}

function align(dir: 'rtl' | 'ltr', end = false): 'left' | 'right' {
  if (dir === 'rtl') return end ? 'left' : 'right'
  return end ? 'right' : 'left'
}

function InvoiceDocument({ data }: { data: InvoiceDocData }): JSX.Element {
  const dir = data.direction
  const start = dir === 'rtl' ? 'right' : 'left'
  const money = (c: number): string => `${formatCents(c)} ${data.currency}`
  return (
    <Document>
      <Page size="A4" style={[styles.page, { direction: dir }]}>
        {/* Header: business identity + invoice meta */}
        <View style={styles.headerBox}>
          <View>
            <Text style={[styles.bizName, { textAlign: start }]}>{BUSINESS_INFO.name}</Text>
            <Text style={[styles.bizPhones, { textAlign: start }]}>{BUSINESS_INFO.phones}</Text>
          </View>
          <View>
            <Text style={[styles.invTitle, { textAlign: align(dir, true) }]}>بل فروش</Text>
            <Text style={[styles.invMeta, { textAlign: align(dir, true) }]}>نمبر: {data.number}</Text>
            <Text style={[styles.invMeta, { textAlign: align(dir, true) }]}>
              تاریخ: {formatDate(data.dateEpoch, data.calendar)}
            </Text>
          </View>
        </View>

        {/* Buyer */}
        <View style={styles.buyerBox}>
          <Text style={[styles.buyerLabel, { textAlign: start }]}>خریدار</Text>
          <Text style={[styles.buyerName, { textAlign: start }]}>{data.buyerName}</Text>
          {data.buyerPhone ? (
            <Text style={[styles.bizPhones, { textAlign: start }]}>{data.buyerPhone}</Text>
          ) : null}
        </View>

        {/* Line table */}
        <View style={styles.table}>
          <View style={styles.headerRow}>
            <Text style={[styles.cellBold, { flex: COLS.index, textAlign: align(dir) }]}>#</Text>
            <Text style={[styles.cellBold, { flex: COLS.goods, textAlign: align(dir) }]}>نوع جنس</Text>
            <Text style={[styles.cellBold, { flex: COLS.label, textAlign: align(dir) }]}>نمبر قالین</Text>
            <Text style={[styles.cellBold, { flex: COLS.length, textAlign: align(dir, true) }]}>طول</Text>
            <Text style={[styles.cellBold, { flex: COLS.width, textAlign: align(dir, true) }]}>عرض</Text>
            <Text style={[styles.cellBold, { flex: COLS.area, textAlign: align(dir, true) }]}>متراژ</Text>
            <Text style={[styles.cellBold, { flex: COLS.price, textAlign: align(dir, true) }]}>قیمت فی‌متر</Text>
            <Text style={[styles.cellBold, { flex: COLS.total, textAlign: align(dir, true) }]}>جمله</Text>
          </View>

          {data.lines.map((l, i) => (
            <View key={i} style={styles.row} wrap={false}>
              <Text style={[styles.cell, { flex: COLS.index, textAlign: align(dir) }]}>{i + 1}</Text>
              <Text style={[styles.cell, { flex: COLS.goods, textAlign: align(dir) }]}>{l.goodsType}</Text>
              <Text style={[styles.cell, { flex: COLS.label, textAlign: align(dir) }]}>{l.labelNumber || '—'}</Text>
              <Text style={[styles.cell, { flex: COLS.length, textAlign: align(dir, true) }]}>{l.length || '—'}</Text>
              <Text style={[styles.cell, { flex: COLS.width, textAlign: align(dir, true) }]}>{l.width || '—'}</Text>
              <Text style={[styles.cell, { flex: COLS.area, textAlign: align(dir, true) }]}>{l.area.toFixed(2)}</Text>
              <Text style={[styles.cell, { flex: COLS.price, textAlign: align(dir, true) }]}>{formatCents(l.unitPriceCents)}</Text>
              <Text style={[styles.cell, { flex: COLS.total, textAlign: align(dir, true) }]}>{formatCents(l.totalCents)}</Text>
            </View>
          ))}

          {/* Totals */}
          <View style={styles.totalRow} wrap={false}>
            <Text
              style={[
                styles.cellBold,
                { flex: COLS.index + COLS.goods + COLS.label + COLS.length + COLS.width + COLS.area, textAlign: align(dir, true) }
              ]}
            >
              مجموع کل
            </Text>
            <Text style={[styles.cellBold, { flex: COLS.price + COLS.total, textAlign: align(dir, true) }]}>
              {money(data.grandTotalCents)}
            </Text>
          </View>
        </View>

        {/* Signature + stamp */}
        <View style={styles.signRow}>
          <Text style={styles.signBox}>امضا</Text>
          <Text style={styles.signBox}>مهر</Text>
        </View>
      </Page>
    </Document>
  )
}

/** Render a sell invoice to PDF bytes (for saving via the main-process dialog). */
export async function generateInvoicePdf(data: InvoiceDocData): Promise<Uint8Array> {
  const blob = await pdf(<InvoiceDocument data={data} />).toBlob()
  const buf = await blob.arrayBuffer()
  return new Uint8Array(buf)
}
