import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FileDown, Play } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { DateInput } from '@renderer/components/ui/date-input'
import { useSettings } from '@renderer/store/settings'
import { startOfDayEpoch, endOfDayEpoch, formatDateTime } from '@renderer/lib/date'
import type { ReportId, ReportParams, ReportResult, RenderedReport } from '@shared/reports'
import { formatReport } from './format'
import { ReportTable } from './ReportTable'
import { generateReportPdf } from './ReportPdf'

interface NeedSpec {
  client?: boolean
  dateRange?: boolean
  days?: boolean
  by?: boolean
  granularity?: boolean
}
const REPORTS: { id: ReportId; needs: NeedSpec }[] = [
  { id: 'clientStatement', needs: { client: true, dateRange: true } },
  { id: 'warehouse', needs: {} },
  { id: 'periodicProfit', needs: { dateRange: true } },
  { id: 'soldList', needs: { dateRange: true } },
  { id: 'purchasedList', needs: { dateRange: true } },
  { id: 'receivablesPayables', needs: {} },
  { id: 'stagnant', needs: { days: true } },
  { id: 'topClients', needs: { dateRange: true, by: true } },
  { id: 'turnover', needs: { dateRange: true, granularity: true } }
]

export function ReportsModule(): JSX.Element {
  const { t } = useTranslation()
  const { language, calendar } = useSettings()

  const [reportId, setReportId] = useState<ReportId>('clientStatement')
  const [clients, setClients] = useState<{ id: number; name: string }[]>([])
  const [clientId, setClientId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [days, setDays] = useState('90')
  const [by, setBy] = useState<'purchase' | 'profit'>('purchase')
  const [granularity, setGranularity] = useState<'day' | 'month'>('month')

  const [result, setResult] = useState<ReportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const needs = REPORTS.find((r) => r.id === reportId)!.needs

  useEffect(() => {
    void window.api.clients
      .list({ includeArchived: true, limit: 2000, offset: 0 })
      .then((r) => setClients(r.rows.map((c) => ({ id: c.id, name: c.name }))))
  }, [])

  const buildParams = useCallback((): ReportParams => {
    const p: ReportParams = {}
    if (needs.dateRange) {
      p.fromDate = startOfDayEpoch(from)
      p.toDate = endOfDayEpoch(to)
    }
    if (needs.client) p.clientId = clientId ? Number(clientId) : undefined
    if (needs.days) p.days = Number(days) || 0
    if (needs.by) p.by = by
    if (needs.granularity) p.granularity = granularity
    return p
  }, [needs, from, to, clientId, days, by, granularity])

  const run = useCallback(async (): Promise<void> => {
    if (needs.client && !clientId) {
      setResult(null)
      setError(t('reports.selectClient', 'Select a client'))
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.reports.run(reportId, buildParams())
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [reportId, needs, clientId, buildParams, t])

  // Auto-run when switching to a report that needs no required selection.
  useEffect(() => {
    setResult(null)
    setError(null)
    if (!REPORTS.find((r) => r.id === reportId)!.needs.client) void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId])

  const rendered: RenderedReport | null = useMemo(() => {
    if (!result) return null
    return formatReport(result, {
      t,
      language,
      calendar,
      generatedAtLabel: `${t('reports.generatedAt', 'Generated')}: ${formatDateTime(Date.now(), calendar)}`
    })
  }, [result, t, language, calendar])

  async function exportPdf(): Promise<void> {
    if (!rendered) return
    setExporting(true)
    try {
      const bytes = await generateReportPdf(rendered)
      const safe = rendered.title.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'report'
      await window.api.pdf.save(`${safe}.pdf`, bytes)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight">{t('reports.title', 'Reports')}</h2>
        <Button variant="outline" onClick={exportPdf} disabled={!rendered || exporting}>
          <FileDown className="h-4 w-4" />
          {t('reports.export', 'Export PDF')}
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-card">
        <Field label={t('reports.title', 'Report')}>
          <select
            value={reportId}
            onChange={(e) => setReportId(e.target.value as ReportId)}
            className="h-9 rounded-lg border border-input bg-card shadow-soft px-2 text-sm"
          >
            {REPORTS.map((r) => (
              <option key={r.id} value={r.id}>
                {t(`reports.${r.id}`, r.id)}
              </option>
            ))}
          </select>
        </Field>

        {needs.client && (
          <Field label={t('reports.client', 'Client')}>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="h-9 rounded-lg border border-input bg-card shadow-soft px-2 text-sm"
            >
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {needs.dateRange && (
          <>
            <Field label={t('reports.from', 'From')}>
              <DateInput value={from} onChange={setFrom} className="h-9 w-56" />
            </Field>
            <Field label={t('reports.to', 'To')}>
              <DateInput value={to} onChange={setTo} className="h-9 w-56" />
            </Field>
          </>
        )}
        {needs.days && (
          <Field label={t('reports.days', 'Days in stock ≥')}>
            <Input type="number" value={days} onChange={(e) => setDays(e.target.value)} className="h-9 w-24" />
          </Field>
        )}
        {needs.by && (
          <Field label={t('reports.by', 'Rank by')}>
            <select
              value={by}
              onChange={(e) => setBy(e.target.value as 'purchase' | 'profit')}
              className="h-9 rounded-lg border border-input bg-card shadow-soft px-2 text-sm"
            >
              <option value="purchase">{t('reports.volume', 'Volume')}</option>
              <option value="profit">{t('reports.byProfit', 'Profit')}</option>
            </select>
          </Field>
        )}
        {needs.granularity && (
          <Field label={t('reports.granularity', 'Granularity')}>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as 'day' | 'month')}
              className="h-9 rounded-lg border border-input bg-card shadow-soft px-2 text-sm"
            >
              <option value="month">{t('reports.monthly', 'Monthly')}</option>
              <option value="day">{t('reports.daily', 'Daily')}</option>
            </select>
          </Field>
        )}

        <Button onClick={run} disabled={loading}>
          <Play className="h-4 w-4" />
          {t('reports.run', 'Run')}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {loading && <p className="text-sm text-muted-foreground">{t('common.loading', 'Loading…')}</p>}
        {!loading && rendered && <ReportTable sections={rendered.sections} />}
        {!loading && !rendered && !error && (
          <p className="text-sm text-muted-foreground">{t('reports.noData', 'No data for the selected filters.')}</p>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label className="space-y-1 text-xs text-muted-foreground">
      <span className="block">{label}</span>
      {children}
    </label>
  )
}
