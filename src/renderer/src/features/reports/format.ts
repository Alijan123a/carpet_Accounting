import type { TFunction } from 'i18next'
import { formatCents } from '@shared/accounting'
import type { ReportResult, RenderedReport, ColumnKind } from '@shared/reports'
import type { Calendar } from '@renderer/store/settings'
import { formatDate } from '@renderer/lib/date'

function formatCell(
  value: string | number | null,
  kind: ColumnKind,
  calendar: Calendar,
  t: TFunction
): string {
  if (value === null || value === undefined || value === '') return ''
  switch (kind) {
    case 'money':
      return formatCents(Number(value))
    case 'date':
      return formatDate(Number(value), calendar)
    case 'kg':
      return Number(value).toLocaleString('en-US', { maximumFractionDigits: 3 })
    case 'number':
      return Number(value).toLocaleString('en-US')
    case 'txtype':
      return t(`tx.type.${value}`, String(value))
    case 'i18nKey':
      return t(String(value))
    default:
      return String(value)
  }
}

const defaultAlign = (kind: ColumnKind): 'start' | 'end' =>
  kind === 'money' || kind === 'kg' || kind === 'number' ? 'end' : 'start'

/**
 * Turn a raw ReportResult (numbers + epochs) into a fully formatted RenderedReport
 * (strings), honoring the active language + calendar. Used for BOTH the on-screen
 * table and the PDF export, so formatting lives in exactly one place.
 */
export function formatReport(
  result: ReportResult,
  opts: { t: TFunction; language: 'fa' | 'en'; calendar: Calendar; generatedAtLabel: string }
): RenderedReport {
  const { t, language, calendar, generatedAtLabel } = opts
  return {
    title: t(result.titleKey, result.defaultTitle),
    direction: language === 'fa' ? 'rtl' : 'ltr',
    generatedAtLabel,
    sections: result.sections.map((s) => ({
      title: s.title ?? (s.titleKey ? t(s.titleKey) : undefined),
      columns: s.columns.map((c) => ({ label: t(c.labelKey, c.defaultLabel), align: c.align ?? defaultAlign(c.kind) })),
      rows: s.rows.map((row) => s.columns.map((c) => formatCell(row[c.key], c.kind, calendar, t))),
      footer: s.footer ? s.columns.map((c) => formatCell(s.footer![c.key], c.kind, calendar, t)) : undefined
    }))
  }
}
