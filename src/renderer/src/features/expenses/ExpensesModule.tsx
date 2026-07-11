import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { toast } from '@renderer/components/ui/toast'
import { DateInput } from '@renderer/components/ui/date-input'
import { SortHeader, type SortState } from '@renderer/components/ui/sort-header'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/store/settings'
import { formatCents, ENABLED_CURRENCIES } from '@shared/accounting'
import type { Currency } from '@shared/accounting'
import { formatDate, startOfDayEpoch, endOfDayEpoch } from '@renderer/lib/date'
import type { ExpenseView } from '@shared/contracts'
import { ExpenseFormDialog } from './ExpenseFormDialog'
import { DeleteConfirmDialog } from '@renderer/components/DeleteConfirmDialog'

const PAGE_SIZE = 100
const ROW_HEIGHT = 48
const GRID =
  'grid grid-cols-[110px_minmax(120px,1fr)_64px_120px_minmax(120px,1fr)_92px] items-center gap-0 px-4 [&>*]:border-e [&>*]:border-border [&>*:last-child]:border-e-0 [&>*]:px-2 [&>*]:!text-center [&>*]:!justify-center'

export function ExpensesModule(): JSX.Element {
  const { t } = useTranslation()
  const { calendar } = useSettings()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [currency, setCurrency] = useState<Currency | 'all'>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<SortState>({ by: 'expenseDate', dir: 'desc' })
  const [rows, setRows] = useState<ExpenseView[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [editExpense, setEditExpense] = useState<ExpenseView | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ExpenseView | null>(null)
  const [busy, setBusy] = useState(false)

  const rowsRef = useRef<ExpenseView[]>([])
  const loadingRef = useRef(false)
  rowsRef.current = rows

  useEffect(() => {
    const h = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(h)
  }, [searchInput])

  const loadCategories = useCallback(async (): Promise<void> => {
    setCategories(await window.api.expenses.categories())
  }, [])
  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  const fetchPage = useCallback(
    async (reset: boolean): Promise<void> => {
      if (loadingRef.current) return
      loadingRef.current = true
      setLoading(true)
      try {
        const offset = reset ? 0 : rowsRef.current.length
        const res = await window.api.expenses.list({
          search,
          category,
          currency,
          fromDate: startOfDayEpoch(from),
          toDate: endOfDayEpoch(to),
          sortBy: sort.by,
          sortDir: sort.dir,
          limit: PAGE_SIZE,
          offset
        })
        setTotal(res.total)
        setRows((prev) => (reset ? res.rows : [...prev, ...res.rows]))
      } finally {
        loadingRef.current = false
        setLoading(false)
      }
    },
    [search, category, currency, from, to, sort]
  )
  useEffect(() => {
    void fetchPage(true)
  }, [fetchPage])

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10
  })
  function onScroll(): void {
    const el = parentRef.current
    if (!el || rowsRef.current.length >= total) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - ROW_HEIGHT * 4) void fetchPage(false)
  }
  function refresh(): void {
    void fetchPage(true)
    void loadCategories()
  }

  async function doDelete(): Promise<void> {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await window.api.expenses.remove(deleteTarget.id)
      setDeleteTarget(null)
      toast.success(t('common.deleted', 'Deleted.'))
      refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('expenses.title', 'Expenses')}</h2>
          <p className="text-xs text-muted-foreground">{t('expenses.total', { total, defaultValue: '{{total}} total' })}</p>
        </div>
        <Button
          onClick={() => {
            setEditExpense(null)
            setFormOpen(true)
          }}
        >
          <Plus className="h-4 w-4" />
          {t('expenses.add', 'Add expense')}
        </Button>
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('expenses.searchPlaceholder', 'Search category or note…')}
          className="h-9 max-w-xs"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label={t('expenses.category', 'Category')}
          className="h-9 rounded-lg border border-input bg-card shadow-soft px-2 text-sm"
        >
          <option value="all">{t('expenses.allCategories', 'All categories')}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency | 'all')}
          aria-label={t('expenses.currency', 'Currency')}
          className="h-9 rounded-lg border border-input bg-card shadow-soft px-2 text-sm"
        >
          <option value="all">{t('expenses.allCurrencies', 'All currencies')}</option>
          {ENABLED_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">{t('statement.from', 'From')}</span>
          <DateInput value={from} onChange={setFrom} className="h-9 w-56" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">{t('statement.to', 'To')}</span>
          <DateInput value={to} onChange={setTo} className="h-9 w-56" />
        </label>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        <div className={cn(GRID, 'h-9 shrink-0 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground')}>
          <SortHeader col="expenseDate" sort={sort} onSort={setSort}>
            {t('expenses.date', 'Date')}
          </SortHeader>
          <SortHeader col="category" sort={sort} onSort={setSort}>
            {t('expenses.category', 'Category')}
          </SortHeader>
          <SortHeader col="currency" sort={sort} onSort={setSort}>
            {t('expenses.currency', 'Cur')}
          </SortHeader>
          <SortHeader col="amountCents" sort={sort} onSort={setSort} align="end">
            {t('expenses.amount', 'Amount')}
          </SortHeader>
          <span>{t('expenses.note', 'Note')}</span>
          <span />
        </div>
        <div ref={parentRef} onScroll={onScroll} className="flex-1 overflow-auto">
          {rows.length === 0 && !loading && (
            <div className="p-8 text-center text-sm text-muted-foreground">{t('expenses.empty', 'No expenses found.')}</div>
          )}
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const ex = rows[vi.index]
              return (
                <div
                  key={ex.id}
                  className={cn(GRID, 'absolute start-0 top-0 w-full border-b border-border text-sm')}
                  style={{ height: `${ROW_HEIGHT}px`, transform: `translateY(${vi.start}px)` }}
                >
                  <span className="text-muted-foreground">{formatDate(ex.expenseDate, calendar)}</span>
                  <span className="truncate font-medium">{ex.category}</span>
                  <span className="text-muted-foreground">{ex.currency}</span>
                  <span className="text-end font-mono tabular-nums">{formatCents(ex.amountCents)}</span>
                  <span className="truncate text-muted-foreground">{ex.note || t('common.none', '—')}</span>
                  <span className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={t('common.edit', 'Edit')}
                      aria-label={t('common.edit', 'Edit')}
                      onClick={() => {
                        setEditExpense(ex)
                        setFormOpen(true)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={t('common.delete', 'Delete')}
                      aria-label={t('common.delete', 'Delete')}
                      onClick={() => setDeleteTarget(ex)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </span>
                </div>
              )
            })}
          </div>
          {loading && <div className="p-3 text-center text-xs text-muted-foreground">{t('common.loading', 'Loading…')}</div>}
        </div>
      </div>

      <ExpenseFormDialog open={formOpen} onOpenChange={setFormOpen} expense={editExpense} onSaved={refresh} />
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t('expenses.deleteConfirmTitle', 'Delete this expense?')}
        body={t('expenses.deleteConfirmBody', 'This permanently removes the expense.')}
        expectedText={deleteTarget?.category ?? ''}
        busy={busy}
        onConfirm={doDelete}
      />
    </div>
  )
}
