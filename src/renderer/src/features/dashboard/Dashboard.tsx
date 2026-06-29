import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts'
import { formatCents } from '@shared/accounting'
import { cn } from '@renderer/lib/utils'
import type { DashboardSummary } from '@shared/contracts'

/** Rolling 12-month window: first day 11 months ago → now. */
function twelveMonthRange(): { fromDate: number; toDate: number } {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  return { fromDate: from.getTime(), toDate: now.getTime() }
}

export function Dashboard(): JSX.Element {
  const { t } = useTranslation()
  const [data, setData] = useState<DashboardSummary | null>(null)

  useEffect(() => {
    const range = twelveMonthRange()
    void window.api.dashboard.summary(range).then(setData)
  }, [])

  // Keep integer cents in the chart data; format to 2 decimals only at display
  // (axis ticks + tooltip) via formatCents — no money arithmetic in the UI.
  const chartData = useMemo(
    () => (data?.turnover ?? []).map((p) => ({ period: p.period, AFN: p.afn, USD: p.usd })),
    [data]
  )

  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">{t('common.loading', 'Loading…')}</div>
  }

  const green = 'text-green-600 dark:text-green-400'
  const red = 'text-red-600 dark:text-red-400'

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">{t('dashboard.title', 'Dashboard')}</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title={t('dashboard.receivables', 'Receivables')}>
          <Money label="AFN" cents={data.receivables.AFN} className={green} />
          <Money label="USD" cents={data.receivables.USD} className={green} />
        </Card>
        <Card title={t('dashboard.payables', 'Payables')}>
          <Money label="AFN" cents={data.payables.AFN} className={red} />
          <Money label="USD" cents={data.payables.USD} className={red} />
        </Card>
        <Card title={t('dashboard.periodProfit', "This period's profit (net)")}>
          <Money label="AFN" cents={data.periodProfit.AFN.netProfitCents} className={signColor(data.periodProfit.AFN.netProfitCents)} />
          <Money label="USD" cents={data.periodProfit.USD.netProfitCents} className={signColor(data.periodProfit.USD.netProfitCents)} />
        </Card>
        <Card title={t('dashboard.warehouse', 'Carpets in warehouse')}>
          <div className="text-3xl font-semibold">{data.warehouseCount}</div>
        </Card>
        <Card title={t('dashboard.materialStock', 'Material stock (kg)')}>
          <div className="text-3xl font-semibold tabular-nums">
            {data.materialStockKg.toLocaleString('en-US', { maximumFractionDigits: 3 })}
          </div>
        </Card>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">{t('dashboard.turnover', 'Monthly turnover (sales)')}</h3>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="period" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" width={88} tickFormatter={(v: number) => formatCents(v)} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                formatter={(value: number) => formatCents(Number(value))}
              />
              <Legend />
              <Bar dataKey="AFN" fill="hsl(var(--laaki))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="USD" fill="hsl(var(--indigo))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function signColor(cents: number): string {
  return cents > 0 ? 'text-green-600 dark:text-green-400' : cents < 0 ? 'text-red-600 dark:text-red-400' : ''
}

function Card({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 text-sm text-muted-foreground">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Money({ label, cents, className }: { label: string; cents: number; className?: string }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-lg font-semibold tabular-nums', className)}>{formatCents(cents)}</span>
    </div>
  )
}
