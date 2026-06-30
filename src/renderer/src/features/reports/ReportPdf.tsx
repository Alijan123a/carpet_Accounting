import { Document, Page, View, Text, StyleSheet, Font, pdf } from '@react-pdf/renderer'
import { VAZIR_REGULAR_DATA_URI, VAZIR_BOLD_DATA_URI } from './fontData'
import type { RenderedReport } from '@shared/reports'

// Vazirmatn covers Latin + Persian/Arabic, so it is used for both languages.
// Registered from embedded base64 data URIs (no fetch) so it works both in dev
// and under file:// in the packaged app. fontkit performs Arabic shaping from
// the font's GSUB tables; the document direction handles RTL ordering.
Font.register({
  family: 'Vazirmatn',
  fonts: [
    { src: VAZIR_REGULAR_DATA_URI, fontWeight: 'normal' },
    { src: VAZIR_BOLD_DATA_URI, fontWeight: 'bold' }
  ]
})

const styles = StyleSheet.create({
  page: { paddingHorizontal: 28, paddingVertical: 26, fontSize: 9, fontFamily: 'Vazirmatn', color: '#111' },
  title: { fontSize: 16, fontWeight: 'bold', marginBottom: 3 },
  meta: { fontSize: 8, color: '#666', marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: 'bold', marginTop: 10, marginBottom: 4 },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    backgroundColor: '#f1f1f1',
    paddingVertical: 3
  },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ddd', paddingVertical: 2.5 },
  footerRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#333', paddingVertical: 3 },
  cell: { flex: 1, paddingHorizontal: 3 },
  cellBold: { flex: 1, paddingHorizontal: 3, fontWeight: 'bold' },
  empty: { fontSize: 9, color: '#888', paddingVertical: 6 }
})

function cellAlign(align: 'start' | 'end', dir: 'rtl' | 'ltr'): 'left' | 'right' {
  if (dir === 'rtl') return align === 'end' ? 'left' : 'right'
  return align === 'end' ? 'right' : 'left'
}

function ReportDocument({ report }: { report: RenderedReport }): JSX.Element {
  const dir = report.direction
  return (
    <Document>
      <Page size="A4" style={[styles.page, { direction: dir }]}>
        <Text style={[styles.title, { textAlign: dir === 'rtl' ? 'right' : 'left' }]}>{report.title}</Text>
        <Text style={[styles.meta, { textAlign: dir === 'rtl' ? 'right' : 'left' }]}>{report.generatedAtLabel}</Text>

        {report.sections.map((section, si) => (
          <View key={si} wrap>
            {section.title && (
              <Text style={[styles.sectionTitle, { textAlign: dir === 'rtl' ? 'right' : 'left' }]}>{section.title}</Text>
            )}
            <View style={styles.headerRow}>
              {section.columns.map((c, ci) => (
                <Text key={ci} style={[styles.cellBold, { textAlign: cellAlign(c.align, dir) }]}>
                  {c.label}
                </Text>
              ))}
            </View>
            {section.rows.length === 0 && <Text style={styles.empty}>—</Text>}
            {section.rows.map((row, ri) => (
              <View key={ri} style={styles.row} wrap={false}>
                {row.map((value, ci) => (
                  <Text key={ci} style={[styles.cell, { textAlign: cellAlign(section.columns[ci].align, dir) }]}>
                    {value}
                  </Text>
                ))}
              </View>
            ))}
            {section.footer && (
              <View style={styles.footerRow} wrap={false}>
                {section.footer.map((value, ci) => (
                  <Text key={ci} style={[styles.cellBold, { textAlign: cellAlign(section.columns[ci].align, dir) }]}>
                    {value}
                  </Text>
                ))}
              </View>
            )}
          </View>
        ))}
      </Page>
    </Document>
  )
}

/** Render a report to PDF bytes (for saving via the main-process dialog). */
export async function generateReportPdf(report: RenderedReport): Promise<Uint8Array> {
  const blob = await pdf(<ReportDocument report={report} />).toBlob()
  const buf = await blob.arrayBuffer()
  return new Uint8Array(buf)
}
