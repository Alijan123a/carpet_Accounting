import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Plus, SlidersHorizontal, FileText, PackagePlus } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { SortHeader, type SortState } from '@renderer/components/ui/sort-header'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/store/settings'
import { formatCents } from '@shared/accounting'
import type { CarpetListItem, CarpetStatus } from '@shared/contracts'
import { statusLabel, statusLabelByKey } from './statusLabel'
import { CarpetFormDialog } from './CarpetFormDialog'
import { StatusesDialog } from './StatusesDialog'
import { SellInvoiceDialog } from './SellInvoiceDialog'
import { BuyInvoiceDialog } from './BuyInvoiceDialog'

const PAGE_SIZE = 100
const ROW_HEIGHT = 48
// label | L | W | area | grade | cur | price/m | ded | total | status | type | profit
const GRID =
  'grid grid-cols-[120px_64px_64px_72px_80px_56px_110px_100px_120px_120px_90px_100px] items-center gap-0 px-3 [&>*]:border-e [&>*]:border-border [&>*:last-child]:border-e-0 [&>*]:px-2 [&>*]:!text-center [&>*]:!justify-center'
const MIN_W = 'min-w-[1100px]'

function Profit({ cents }: { cents: number | null }): JSX.Element {
  if (cents == null) return <span className="text-muted-foreground">—</span>
  const color = cents > 0 ? 'text-green-600 dark:text-green-400' : cents < 0 ? 'text-red-600 dark:text-red-400' : ''
  return <span className={cn('font-mono tabular-nums', color)}>{formatCents(cents)}</span>
}

export function CarpetsList({ onSelect }: { onSelect: (id: number) => void }): JSX.Element {
  const { t } = useTranslation()
  const language = useSettings((s) => s.language)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [gradeFilter, setGradeFilter] = useState<string>('all')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [sort, setSort] = useState<SortState>({ by: 'createdAt', dir: 'desc' })

  const [rows, setRows] = useState<CarpetListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [statuses, setStatuses] = useState<CarpetStatus[]>([])
  const [grades, setGrades] = useState<string[]>([])

  const [formOpen, setFormOpen] = useState(false)
  const [statusesOpen, setStatusesOpen] = useState(false)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [buyInvoiceOpen, setBuyInvoiceOpen] = useState(false)

  const rowsRef = useRef<CarpetListItem[]>([])
  const loadingRef = useRef(false)
  rowsRef.current = rows

  useEffect(() => {
    const h = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(h)
  }, [searchInput])

  const loadMeta = useCallback(async (): Promise<void> => {
    setStatuses(await window.api.carpetStatuses.list())
    setGrades(await window.api.carpets.sortGrades())
  }, [])

  useEffect(() => {
    void loadMeta()
  }, [loadMeta])

  const fetchPage = useCallback(
    async (reset: boolean): Promise<void> => {
      if (loadingRef.current) return
      loadingRef.current = true
      setLoading(true)
      setError(null)
      try {
        const offset = reset ? 0 : rowsRef.current.length
        const res = await window.api.carpets.list({
          search,
          status: statusFilter,
          sortGrade: gradeFilter,
          includeArchived,
          sortBy: sort.by,
          sortDir: sort.dir,
          limit: PAGE_SIZE,
          offset
        })
        setTotal(res.total)
        setRows((prev) => (reset ? res.rows : [...prev, ...res.rows]))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        loadingRef.current = false
        setLoading(false)
      }
    },
    [search, statusFilter, gradeFilter, includeArchived, sort]
  )

  useEffect(() => {
    void fetchPage(true)
  }, [fetchPage])

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  function onScroll(): void {
    const el = parentRef.current
    if (!el || rowsRef.current.length >= total) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - ROW_HEIGHT * 4) void fetchPage(false)
  }

  function refresh(): void {
    void fetchPage(true)
    void loadMeta()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('carpets.title', 'Carpets')}</h2>
          <p className="text-xs text-muted-foreground">{t('carpets.total', { total, defaultValue: '{{total}} total' })}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStatusesOpen(true)}>
            <SlidersHorizontal className="h-4 w-4" />
            {t('carpets.manageStatuses', 'Manage statuses')}
          </Button>
          <Button variant="outline" onClick={() => setInvoiceOpen(true)}>
            <FileText className="h-4 w-4" />
            {t('invoice.button', 'Sell invoice')}
          </Button>
          <Button variant="outline" onClick={() => setBuyInvoiceOpen(true)}>
            <PackagePlus className="h-4 w-4" />
            {t('buyInvoice.button', 'Add carpets')}
          </Button>
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" />
            {t('carpets.addOne', 'Add one')}
          </Button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('carpets.searchPlaceholder', 'Search label or grade…')}
          className="h-9 max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-card shadow-soft px-2 text-sm"
        >
          <option value="all">{t('carpets.allStatuses', 'All statuses')}</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.key}>
              {statusLabel(s, language)}
            </option>
          ))}
        </select>
        <select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-card shadow-soft px-2 text-sm"
        >
          <option value="all">{t('carpets.allGrades', 'All grades')}</option>
          {grades.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          {t('clients.includeArchived', 'Show archived')}
        </label>
      </div>

      <div className="flex min-h-0 flex-1 overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-card">
        <div className={cn(MIN_W, 'flex flex-1 flex-col')}>
          {/* header sits outside the vertical scroll element; both scroll horizontally together */}
          <div className={cn(GRID, 'h-9 shrink-0 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground')}>
              <SortHeader col="labelNumber" sort={sort} onSort={setSort}>
                {t('carpets.label', 'Label #')}
              </SortHeader>
              <SortHeader col="length" sort={sort} onSort={setSort} align="end">
                {t('carpets.length', 'L')}
              </SortHeader>
              <SortHeader col="width" sort={sort} onSort={setSort} align="end">
                {t('carpets.width', 'W')}
              </SortHeader>
              <SortHeader col="area" sort={sort} onSort={setSort} align="end">
                {t('carpets.area', 'Area')}
              </SortHeader>
              <SortHeader col="sortGrade" sort={sort} onSort={setSort}>
                {t('carpets.sortGrade', 'Grade')}
              </SortHeader>
              <SortHeader col="currency" sort={sort} onSort={setSort}>
                {t('carpets.currency', 'Cur')}
              </SortHeader>
              <SortHeader col="pricePerMeterCents" sort={sort} onSort={setSort} align="end">
                {t('carpets.pricePerMeter', 'Price/m')}
              </SortHeader>
              <SortHeader col="sortDeductionCents" sort={sort} onSort={setSort} align="end">
                {t('carpets.deduction', 'Ded.')}
              </SortHeader>
              <SortHeader col="totalPriceCents" sort={sort} onSort={setSort} align="end">
                {t('carpets.totalPrice', 'Total')}
              </SortHeader>
              <SortHeader col="status" sort={sort} onSort={setSort}>
                {t('carpets.status', 'Status')}
              </SortHeader>
              <span>{t('carpets.type', 'Type')}</span>
              <span className="text-end">{t('carpets.profit', 'Profit')}</span>
            </div>
          <div ref={parentRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
            {error && (
              <div role="alert" className="p-4 text-sm text-destructive">
                {error}
              </div>
            )}
            {!error && rows.length === 0 && !loading && (
              <div className="p-8 text-center text-sm text-muted-foreground">{t('carpets.empty', 'No carpets found.')}</div>
            )}

            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
              {virtualizer.getVirtualItems().map((vi) => {
                const c = rows[vi.index]
                return (
                  <div
                    key={c.id}
                    role="button"
                    onClick={() => onSelect(c.id)}
                    className={cn(GRID, 'absolute start-0 top-0 w-full cursor-pointer border-b border-border text-sm hover:bg-accent/50')}
                    style={{ height: `${ROW_HEIGHT}px`, transform: `translateY(${vi.start}px)` }}
                  >
                    <span className="flex items-center gap-1 truncate font-medium">
                      {c.labelNumber}
                      {c.archived && (
                        <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                          {t('clients.archivedBadge', 'Archived')}
                        </span>
                      )}
                    </span>
                    <span className="text-end text-muted-foreground">{c.length}</span>
                    <span className="text-end text-muted-foreground">{c.width}</span>
                    <span className="text-end text-muted-foreground">{c.area.toFixed(2)}</span>
                    <span className="truncate text-muted-foreground">{c.sortGrade || t('common.none', '—')}</span>
                    <span className="text-muted-foreground">{c.currency}</span>
                    <span className="text-end font-mono tabular-nums">{formatCents(c.pricePerMeterCents)}</span>
                    <span className="text-end font-mono tabular-nums">{formatCents(c.sortDeductionCents)}</span>
                    <span className="text-end font-mono tabular-nums">{formatCents(c.totalPriceCents)}</span>
                    <span className="truncate">{statusLabelByKey(statuses, c.status, language)}</span>
                    <span>
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 text-xs font-medium',
                          c.origin === 'ordered'
                            ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {c.origin === 'ordered'
                          ? t('carpets.originOrdered', 'Ordered')
                          : t('carpets.originBought', 'Bought')}
                      </span>
                    </span>
                    <span className="text-end">
                      <Profit cents={c.profitCents} />
                    </span>
                  </div>
                )
              })}
            </div>
            {loading && <div className="p-3 text-center text-xs text-muted-foreground">{t('common.loading', 'Loading…')}</div>}
          </div>
        </div>
      </div>

      <CarpetFormDialog open={formOpen} onOpenChange={setFormOpen} carpet={null} onSaved={refresh} />
      <StatusesDialog open={statusesOpen} onOpenChange={setStatusesOpen} onChanged={loadMeta} />
      <SellInvoiceDialog open={invoiceOpen} onOpenChange={setInvoiceOpen} onSaved={refresh} />
      <BuyInvoiceDialog open={buyInvoiceOpen} onOpenChange={setBuyInvoiceOpen} onSaved={refresh} />
    </div>
  )
}
