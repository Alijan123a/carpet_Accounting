import type { Currency, PeriodProfitResult } from './accounting'

/**
 * Normalized report model shared by main (producer), the on-screen table, and
 * the PDF exporter. Reports return RAW values (cents as numbers, dates as epoch
 * ms); the renderer formats them per the active language + calendar so money,
 * dates and numbers are formatted in exactly one place.
 */
export type ColumnKind = 'text' | 'money' | 'kg' | 'date' | 'number' | 'txtype' | 'i18nKey'

export interface ReportColumn {
  key: string
  /** i18n key + fallback label. */
  labelKey: string
  defaultLabel: string
  align?: 'start' | 'end'
  kind: ColumnKind
}

export type ReportRow = Record<string, string | number | null>

export interface ReportSection {
  /** Literal title (e.g. "AFN"/"USD") or omitted. */
  title?: string
  /** i18n key for the section title (resolved by the renderer). */
  titleKey?: string
  columns: ReportColumn[]
  rows: ReportRow[]
  /** Optional totals row. */
  footer?: ReportRow
}

export interface ReportResult {
  titleKey: string
  defaultTitle: string
  sections: ReportSection[]
}

export type ReportId =
  | 'clientStatement'
  | 'warehouse'
  | 'periodicProfit'
  | 'soldList'
  | 'purchasedList'
  | 'receivablesPayables'
  | 'stagnant'
  | 'topClients'
  | 'turnover'

export interface ReportParams {
  fromDate?: number | null
  toDate?: number | null
  clientId?: number
  days?: number
  by?: 'purchase' | 'profit'
  granularity?: 'day' | 'month'
  limit?: number
}

/** Fully formatted, ready to lay out as a table on screen or in a PDF. */
export interface RenderedColumn {
  label: string
  align: 'start' | 'end'
}
export interface RenderedSection {
  title?: string
  columns: RenderedColumn[]
  rows: string[][]
  footer?: string[]
}
export interface RenderedReport {
  title: string
  /** 'rtl' for Farsi, 'ltr' otherwise — drives PDF layout. */
  direction: 'rtl' | 'ltr'
  generatedAtLabel: string
  sections: RenderedSection[]
}

export type { PeriodProfitResult, Currency }
