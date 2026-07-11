import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Package,
  Boxes,
  type LucideIcon
} from 'lucide-react'
import { formatCents } from '@shared/accounting'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@renderer/components/ui/card'
import { DateInput } from '@renderer/components/ui/date-input'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/store/settings'
import { startOfDayEpoch, endOfDayEpoch } from '@renderer/lib/date'
import type { DashboardSummary } from '@shared/contracts'

/** Preset windows for the dashboard date filter. */
type RangePreset = 'today' | 'week' | 'month' | 'halfYear' | 'year' | 'all' | 'custom'

const DAY_MS = 86_400_000

/** Resolve a preset (+ custom inputs) to an epoch-ms range [fromDate, toDate]. */
function rangeFor(preset: RangePreset, from: string, to: string): { fromDate: number; toDate: number } {
  const now = new Date()
  const end = now.getTime()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  switch (preset) {
    case 'today':
      return { fromDate: startOfToday, toDate: end }
    case 'week':
      return { fromDate: end - 7 * DAY_MS, toDate: end }
    case 'month':
      return { fromDate: new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).getTime(), toDate: end }
    case 'halfYear':
      return { fromDate: new Date(now.getFullYear(), now.getMonth() - 6, 1).getTime(), toDate: end }
    case 'year':
      return { fromDate: new Date(now.getFullYear() - 1, now.getMonth(), 1).getTime(), toDate: end }
    case 'all':
      return { fromDate: 0, toDate: end }
    case 'custom':
      return { fromDate: from ? startOfDayEpoch(from) ?? 0 : 0, toDate: to ? endOfDayEpoch(to) ?? end : end }
  }
}

const USD_COLOR = '#0d9488' // teal-600
const AFN_COLOR = '#6366f1' // indigo-500
const NET_COLOR = '#10b981' // emerald-500
const EXP_COLOR = '#f59e0b' // amber-500

export function Dashboard(): JSX.Element {
  const { t } = useTranslation()
  const defaultCurrency = useSettings((s) => s.defaultCurrency)
  const [preset, setPreset] = useState<RangePreset>('year')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [data, setData] = useState<DashboardSummary | null>(null)
  // Profit-composition donut is per currency (AFN/USD are never summed).
  const [donutCur, setDonutCur] = useState<'AFN' | 'USD'>(defaultCurrency)

  const range = useMemo(() => rangeFor(preset, customFrom, customTo), [preset, customFrom, customTo])

  useEffect(() => {
    // Keep previous data on screen while the new range loads (no loading flash).
    void window.api.dashboard.summary(range).then(setData)
  }, [range])

  const PRESETS: { key: RangePreset; label: string }[] = [
    { key: 'today', label: t('dashboard.range.today', 'Today') },
    { key: 'week', label: t('dashboard.range.week', 'Last week') },
    { key: 'month', label: t('dashboard.range.month', 'Last month') },
    { key: 'halfYear', label: t('dashboard.range.halfYear', '6 months') },
    { key: 'year', label: t('dashboard.range.year', '1 year') },
    { key: 'all', label: t('dashboard.range.all', 'From beginning') },
    { key: 'custom', label: t('dashboard.range.custom', 'Custom') }
  ]
  const rangeLabel = PRESETS.find((p) => p.key === preset)?.label ?? ''

  // Keep integer cents in the chart data; format to 2 decimals only at display
  // (axis ticks + tooltip) via formatCents — no money arithmetic in the UI.
  const chartData = useMemo(
    () => (data?.turnover ?? []).map((p) => ({ period: p.period, USD: p.usd, AFN: p.afn })),
    [data]
  )

  const donut = useMemo(() => {
    if (!data) return []
    const c = data.periodProfit[donutCur]
    return [
      { name: t('dashboard.net', 'Net'), value: Math.max(0, c.netProfitCents), fill: NET_COLOR },
      { name: t('dashboard.expensesShare', 'Expenses'), value: Math.max(0, c.expensesCents), fill: EXP_COLOR }
    ].filter((s) => s.value > 0)
  }, [data, donutCur, t])

  if (!data) {
    return <div className="p-2 text-sm text-muted-foreground">{t('common.loading', 'Loading…')}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('dashboard.title', 'Dashboard')}</h2>
          <p className="text-sm text-muted-foreground">{t('dashboard.subtitle', 'Overview of your business')}</p>
        </div>

        {/* Date-range filter: affects period profit & turnover. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-xl bg-muted/50 p-1">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                aria-pressed={preset === p.key}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                  preset === p.key ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex items-center gap-1.5">
              <DateInput value={customFrom} onChange={setCustomFrom} className="h-9 w-56" />
              {/* Arrow points "from → to" in the reading direction; flip it in RTL. */}
              <span aria-hidden className="inline-block text-xs text-muted-foreground rtl:rotate-180">
                →
              </span>
              <DateInput value={customTo} onChange={setCustomTo} className="h-9 w-56" />
            </div>
          )}
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard gradient="from-emerald-500 to-teal-600" icon={TrendingUp} title={t('dashboard.receivables', 'Receivables')}>
          <StatMoney label="USD" cents={data.receivables.USD} />
          <StatMoney label="AFN" cents={data.receivables.AFN} />
        </StatCard>
        <StatCard gradient="from-rose-500 to-red-600" icon={TrendingDown} title={t('dashboard.payables', 'Payables')}>
          <StatMoney label="USD" cents={data.payables.USD} />
          <StatMoney label="AFN" cents={data.payables.AFN} />
        </StatCard>
        <StatCard gradient="from-indigo-500 to-violet-600" icon={PiggyBank} title={t('dashboard.netProfit', 'Net profit')}>
          <StatMoney label="USD" cents={data.periodProfit.USD.netProfitCents} />
          <StatMoney label="AFN" cents={data.periodProfit.AFN.netProfitCents} />
        </StatCard>
        <StatCard gradient="from-sky-500 to-blue-600" icon={Package} title={t('dashboard.warehouse', 'Carpets in warehouse')}>
          <StatBig value={data.warehouseCount.toLocaleString('en-US')} unit={t('dashboard.carpetsUnit', 'carpets')} />
        </StatCard>
        <StatCard gradient="from-amber-500 to-orange-500" icon={Boxes} title={t('dashboard.materialStock', 'Material stock (kg)')}>
          <StatBig
            value={data.materialStockKg.toLocaleString('en-US', { maximumFractionDigits: 3 })}
            unit={t('dashboard.kgUnit', 'kg')}
          />
        </StatCard>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Turnover area chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>{t('dashboard.turnover', 'Monthly turnover (sales)')}</CardTitle>
              <CardDescription>{rangeLabel}</CardDescription>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <LegendDot color={USD_COLOR} label="USD" />
              <LegendDot color={AFN_COLOR} label="AFN" />
            </div>
          </CardHeader>
          <CardContent>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="usdFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={USD_COLOR} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={USD_COLOR} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="afnFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={AFN_COLOR} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={AFN_COLOR} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="period" fontSize={11} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                  <YAxis
                    fontSize={11}
                    stroke="hsl(var(--muted-foreground))"
                    width={88}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => formatCents(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 12,
                      fontSize: 12,
                      boxShadow: '0 8px 24px -8px rgba(31,41,89,0.25)'
                    }}
                    formatter={(value: number) => formatCents(Number(value))}
                  />
                  <Area type="monotone" dataKey="USD" stroke={USD_COLOR} strokeWidth={2.5} fill="url(#usdFill)" />
                  <Area type="monotone" dataKey="AFN" stroke={AFN_COLOR} strokeWidth={2.5} fill="url(#afnFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Profit composition donut */}
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>{t('dashboard.profitComposition', 'Profit composition')}</CardTitle>
              <CardDescription>{rangeLabel}</CardDescription>
            </div>
            <div className="flex gap-1 rounded-md bg-muted p-0.5">
              {(['USD', 'AFN'] as const).map((cur) => (
                <button
                  key={cur}
                  onClick={() => setDonutCur(cur)}
                  aria-pressed={donutCur === cur}
                  className={cn(
                    'rounded px-2 py-1 text-xs font-medium transition-colors',
                    donutCur === cur ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground'
                  )}
                >
                  {cur}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {donut.length === 0 ? (
              <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                {t('dashboard.noData', 'No data yet.')}
              </div>
            ) : (
              <>
                <div style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={donut}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={84}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {donut.map((slice) => (
                          <Cell key={slice.name} fill={slice.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 12,
                          fontSize: 12
                        }}
                        formatter={(value: number) => formatCents(Number(value))}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 space-y-2">
                  <DonutLegendRow
                    color={NET_COLOR}
                    label={t('dashboard.net', 'Net')}
                    cents={data.periodProfit[donutCur].netProfitCents}
                  />
                  <DonutLegendRow
                    color={EXP_COLOR}
                    label={t('dashboard.expensesShare', 'Expenses')}
                    cents={data.periodProfit[donutCur].expensesCents}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({
  gradient,
  icon: Icon,
  title,
  children
}: {
  gradient: string
  icon: LucideIcon
  title: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className={cn('relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-card', gradient)}>
      <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-white/5" />
      <div className="relative flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
          <Icon className="h-5 w-5" />
        </span>
        <span className="text-sm font-medium text-white/90">{title}</span>
      </div>
      <div className="relative mt-3 space-y-0.5">{children}</div>
    </div>
  )
}

function StatMoney({ label, cents }: { label: string; cents: number }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs font-medium text-white/70">{label}</span>
      <span className="font-mono text-lg font-bold tabular-nums">{formatCents(cents)}</span>
    </div>
  )
}

function StatBig({ value, unit }: { value: string; unit: string }): JSX.Element {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-3xl font-bold tabular-nums">{value}</span>
      <span className="text-sm text-white/70">{unit}</span>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }): JSX.Element {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function DonutLegendRow({ color, label, cents }: { color: string; label: string; cents: number }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="font-mono font-semibold tabular-nums">{formatCents(cents)}</span>
    </div>
  )
}
