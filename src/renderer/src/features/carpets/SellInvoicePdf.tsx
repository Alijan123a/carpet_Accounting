import { Document, Page, View, Text, Image, StyleSheet, Font, pdf } from '@react-pdf/renderer'
import { VAZIR_REGULAR_DATA_URI, VAZIR_BOLD_DATA_URI } from '@renderer/features/reports/fontData'
import { LOGO_DATA_URI } from './logoData'
import { formatDate } from '@renderer/lib/date'
import { formatCents, currencySymbol } from '@shared/accounting'
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
  name: 'شرکت تولیدی قالین رضایی (غزنه)',
  /** Shown as stacked boxes in the top corner, like the printed bill pad. */
  phones: ['0787286009', '0794235344']
}

/** Brand accent (indigo blue) used for the frame, header + table lines. */
const BRAND = '#2e2e8f'
/** Bill number is printed in red on the pad. */
const RED = '#c81e1e'

/** How many line rows the grid always shows, padding blanks like a bill pad. */
const MIN_ROWS = 14

export interface InvoiceDocLine {
  goodsType: string
  /** «تفصیل» — free-text line description. */
  description?: string | null
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
  page: { padding: 24, fontSize: 9, fontFamily: 'Vazirmatn', color: '#111' },
  // Double-line indigo frame around the whole bill.
  frameOuter: { flex: 1, borderWidth: 2, borderColor: BRAND, padding: 3 },
  frameInner: { flex: 1, borderWidth: 0.75, borderColor: BRAND, padding: 12 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  headerSide: { width: 96, justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  bizName: { fontSize: 15, fontWeight: 'bold', color: BRAND, textAlign: 'center' },
  billNo: { fontSize: 13, fontWeight: 'bold', color: RED, marginTop: 3 },
  phoneBox: {
    borderWidth: 1,
    borderColor: BRAND,
    borderRadius: 3,
    paddingVertical: 2,
    paddingHorizontal: 4,
    marginBottom: 3
  },
  phoneText: { fontSize: 8, color: BRAND, textAlign: 'center' },
  // Company logo (embedded JPEG; see logoData.ts).
  logoImg: { width: 62, height: 62, objectFit: 'contain' },

  // Customer / number / date row
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  metaField: { flexDirection: 'row', alignItems: 'flex-end' },
  metaLabel: { fontSize: 9, color: BRAND, fontWeight: 'bold' },
  metaLine: { borderBottomWidth: 0.75, borderBottomColor: '#555', marginHorizontal: 4, paddingBottom: 1 },
  metaValue: { fontSize: 9, color: '#111' },

  // Table
  table: { borderWidth: 1, borderColor: BRAND },
  headerRow: { flexDirection: 'row', backgroundColor: '#e7e7f5', borderBottomWidth: 1, borderBottomColor: BRAND },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#b9b9d6', minHeight: 17 },
  totalRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: BRAND, backgroundColor: '#eeeef8' },
  cell: { paddingVertical: 3, paddingHorizontal: 4, justifyContent: 'center' },
  cellHead: { paddingVertical: 4, paddingHorizontal: 4, fontWeight: 'bold', color: BRAND },
  cellBold: { paddingVertical: 5, paddingHorizontal: 4, fontWeight: 'bold' },

  // Footer (stamp + signature)
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 22 },
  signBox: { width: '40%' },
  signLabel: { fontSize: 9, color: BRAND, fontWeight: 'bold', marginBottom: 14 },
  signLine: { borderTopWidth: 0.75, borderTopColor: '#555' }
})

// Column widths (flex) — DOM order is fixed; the page `direction` flips it for RTL.
// Vertical separators drawn per-cell to reproduce the ruled bill grid.
const COLS = {
  index: 0.55,
  goods: 1.2,
  description: 1.5,
  label: 1.4,
  length: 0.8,
  width: 0.8,
  area: 0.8,
  price: 1.3,
  total: 1.5
}
const colOrder = ['index', 'goods', 'description', 'label', 'length', 'width', 'area', 'price', 'total'] as const

/** Vertical rule between grid columns (skip after the last column). */
function sep(key: (typeof colOrder)[number]): { borderRightWidth?: number; borderRightColor?: string } {
  if (key === colOrder[colOrder.length - 1]) return {}
  return { borderRightWidth: 0.5, borderRightColor: '#b9b9d6' }
}

function align(dir: 'rtl' | 'ltr', end = false): 'left' | 'right' | 'center' {
  if (dir === 'rtl') return end ? 'left' : 'right'
  return end ? 'right' : 'left'
}

function InvoiceDocument({ data }: { data: InvoiceDocData }): JSX.Element {
  const dir = data.direction
  const center: 'center' = 'center'
  const money = (c: number): string => `${formatCents(c)} ${currencySymbol(data.currency)}`

  // Pad the grid to a fixed number of rows so it always reads like the bill pad.
  const blanks = Math.max(0, MIN_ROWS - data.lines.length)

  return (
    <Document>
      <Page size="A4" style={[styles.page, { direction: dir }]}>
        <View style={styles.frameOuter}>
          <View style={styles.frameInner}>
            {/* Header: phones · shop name + bill number · logo */}
            <View style={styles.header}>
              <View style={styles.headerSide}>
                {BUSINESS_INFO.phones.map((p, i) => (
                  <View key={i} style={styles.phoneBox}>
                    <Text style={styles.phoneText}>{p}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.headerCenter}>
                <Text style={styles.bizName}>{BUSINESS_INFO.name}</Text>
                <Text style={styles.billNo}>{data.number}</Text>
              </View>
              <View style={[styles.headerSide, { alignItems: 'center' }]}>
                <Image src={LOGO_DATA_URI} style={styles.logoImg} />
              </View>
            </View>

            {/* Customer name · number · date */}
            <View style={styles.metaRow}>
              <View style={[styles.metaField, { flex: 1 }]}>
                <Text style={styles.metaLabel}>اسم مشتری:</Text>
                <Text style={[styles.metaLine, styles.metaValue, { flex: 1, textAlign: align(dir) }]}>
                  {data.buyerName}
                  {data.buyerPhone ? `  ·  ${data.buyerPhone}` : ''}
                </Text>
              </View>
              <View style={[styles.metaField, { marginRight: dir === 'rtl' ? 0 : 16, marginLeft: dir === 'rtl' ? 16 : 0 }]}>
                <Text style={styles.metaLabel}>تاریخ:</Text>
                <Text style={[styles.metaLine, styles.metaValue, { minWidth: 70, textAlign: center }]}>
                  {formatDate(data.dateEpoch, data.calendar)}
                </Text>
              </View>
            </View>

            {/* Line grid */}
            <View style={styles.table}>
              <View style={styles.headerRow}>
                <Text style={[styles.cellHead, sep('index'), { flex: COLS.index, textAlign: center }]}>شماره</Text>
                <Text style={[styles.cellHead, sep('goods'), { flex: COLS.goods, textAlign: center }]}>نوع جنس</Text>
                <Text style={[styles.cellHead, sep('description'), { flex: COLS.description, textAlign: center }]}>تفصیل</Text>
                <Text style={[styles.cellHead, sep('label'), { flex: COLS.label, textAlign: center }]}>نمبر قالین</Text>
                <Text style={[styles.cellHead, sep('length'), { flex: COLS.length, textAlign: center }]}>طول</Text>
                <Text style={[styles.cellHead, sep('width'), { flex: COLS.width, textAlign: center }]}>عرض</Text>
                <Text style={[styles.cellHead, sep('area'), { flex: COLS.area, textAlign: center }]}>متر</Text>
                <Text style={[styles.cellHead, sep('price'), { flex: COLS.price, textAlign: center }]}>قیمت</Text>
                <Text style={[styles.cellHead, sep('total'), { flex: COLS.total, textAlign: center }]}>جمله نقد</Text>
              </View>

              {data.lines.map((l, i) => (
                <View key={i} style={styles.row} wrap={false}>
                  <Text style={[styles.cell, sep('index'), { flex: COLS.index, textAlign: center }]}>{i + 1}</Text>
                  <Text style={[styles.cell, sep('goods'), { flex: COLS.goods, textAlign: align(dir) }]}>{l.goodsType}</Text>
                  <Text style={[styles.cell, sep('description'), { flex: COLS.description, textAlign: align(dir) }]}>{l.description || ''}</Text>
                  <Text style={[styles.cell, sep('label'), { flex: COLS.label, textAlign: align(dir) }]}>{l.labelNumber || ''}</Text>
                  <Text style={[styles.cell, sep('length'), { flex: COLS.length, textAlign: center }]}>{l.length || ''}</Text>
                  <Text style={[styles.cell, sep('width'), { flex: COLS.width, textAlign: center }]}>{l.width || ''}</Text>
                  <Text style={[styles.cell, sep('area'), { flex: COLS.area, textAlign: center }]}>{l.area ? l.area.toFixed(2) : ''}</Text>
                  <Text style={[styles.cell, sep('price'), { flex: COLS.price, textAlign: align(dir, true) }]}>{formatCents(l.unitPriceCents)}</Text>
                  <Text style={[styles.cell, sep('total'), { flex: COLS.total, textAlign: align(dir, true) }]}>{formatCents(l.totalCents)}</Text>
                </View>
              ))}

              {/* Blank ruled rows to fill the pad */}
              {Array.from({ length: blanks }).map((_, i) => (
                <View key={`blank-${i}`} style={styles.row} wrap={false}>
                  <Text style={[styles.cell, sep('index'), { flex: COLS.index, textAlign: center, color: '#999' }]}>
                    {data.lines.length + i + 1}
                  </Text>
                  <Text style={[styles.cell, sep('goods'), { flex: COLS.goods }]} />
                  <Text style={[styles.cell, sep('description'), { flex: COLS.description }]} />
                  <Text style={[styles.cell, sep('label'), { flex: COLS.label }]} />
                  <Text style={[styles.cell, sep('length'), { flex: COLS.length }]} />
                  <Text style={[styles.cell, sep('width'), { flex: COLS.width }]} />
                  <Text style={[styles.cell, sep('area'), { flex: COLS.area }]} />
                  <Text style={[styles.cell, sep('price'), { flex: COLS.price }]} />
                  <Text style={[styles.cell, sep('total'), { flex: COLS.total }]} />
                </View>
              ))}

              {/* Total */}
              <View style={styles.totalRow} wrap={false}>
                <Text
                  style={[
                    styles.cellBold,
                    sep('area'),
                    {
                      flex: COLS.index + COLS.goods + COLS.description + COLS.label + COLS.length + COLS.width + COLS.area,
                      textAlign: align(dir, true)
                    }
                  ]}
                >
                  مجموع کل
                </Text>
                <Text style={[styles.cellBold, { flex: COLS.price + COLS.total, textAlign: align(dir, true) }]}>
                  {money(data.grandTotalCents)}
                </Text>
              </View>
            </View>

            {/* Stamp + signature */}
            <View style={styles.footer}>
              <View style={styles.signBox}>
                <Text style={styles.signLabel}>امضا:</Text>
                <View style={styles.signLine} />
              </View>
              <View style={styles.signBox}>
                <Text style={styles.signLabel}>مهر:</Text>
                <View style={styles.signLine} />
              </View>
            </View>
          </View>
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
