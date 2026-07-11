import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Pencil, Plus } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { SortHeader, type SortState } from '@renderer/components/ui/sort-header'
import { cn } from '@renderer/lib/utils'
import type { ClientListItem } from '@shared/contracts'
import { BalanceAmount } from './BalanceAmount'
import { ClientFormDialog } from './ClientFormDialog'

const PAGE_SIZE = 100
const ROW_HEIGHT = 52
const GRID = 'grid grid-cols-[1fr_130px_110px_110px_56px] items-center gap-3 px-4'

export function ClientsList({
  kind,
  onSelect
}: {
  kind: 'buyer' | 'seller'
  onSelect: (id: number) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [sort, setSort] = useState<SortState>({ by: 'name', dir: 'asc' })
  const [rows, setRows] = useState<ClientListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editClient, setEditClient] = useState<ClientListItem | null>(null)

  const rowsRef = useRef<ClientListItem[]>([])
  const loadingRef = useRef(false)
  rowsRef.current = rows

  // Debounce the search box.
  useEffect(() => {
    const h = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(h)
  }, [searchInput])

  const fetchPage = useCallback(
    async (reset: boolean): Promise<void> => {
      if (loadingRef.current) return
      loadingRef.current = true
      setLoading(true)
      setError(null)
      try {
        const offset = reset ? 0 : rowsRef.current.length
        const res = await window.api.clients.list({
          search,
          includeArchived,
          kind,
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
    [search, includeArchived, kind, sort]
  )

  // Reset & reload when filters change.
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

  // Infinite paging: load the next DB page as the user nears the bottom.
  function onScroll(): void {
    const el = parentRef.current
    if (!el) return
    if (rowsRef.current.length >= total) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - ROW_HEIGHT * 4) {
      void fetchPage(false)
    }
  }

  function refresh(): void {
    void fetchPage(true)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {kind === 'buyer' ? t('clients.buyersTitle', 'Buyers') : t('clients.sellersTitle', 'Sellers')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t('clients.total', { total, defaultValue: '{{total}} total' })}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditClient(null)
            setFormOpen(true)
          }}
        >
          <Plus className="h-4 w-4" />
          {kind === 'buyer' ? t('clients.addBuyer', 'Add Buyer') : t('clients.addSeller', 'Add Seller')}
        </Button>
      </div>

      <div className="mb-3 flex items-center gap-4">
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('clients.searchPlaceholder', 'Search name or phone…')}
          className="max-w-xs"
        />
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

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        {/* Header */}
        <div className={cn(GRID, 'h-10 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground')}>
          <SortHeader col="name" sort={sort} onSort={setSort}>
            {t('clients.name', 'Name')}
          </SortHeader>
          <SortHeader col="phone" sort={sort} onSort={setSort}>
            {t('clients.phone', 'Phone')}
          </SortHeader>
          <SortHeader col="balanceUSD" sort={sort} onSort={setSort} align="end">
            USD
          </SortHeader>
          <SortHeader col="balanceAFN" sort={sort} onSort={setSort} align="end">
            AFN
          </SortHeader>
          <span />
        </div>

        {/* Virtualized rows */}
        <div ref={parentRef} onScroll={onScroll} className="h-[calc(100vh-300px)] overflow-auto">
          {error && (
            <div role="alert" className="p-4 text-sm text-destructive">
              {error}
            </div>
          )}
          {!error && rows.length === 0 && !loading && (
            <div className="p-8 text-center text-sm text-muted-foreground">{t('clients.empty', 'No clients found.')}</div>
          )}
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const c = rows[vi.index]
              return (
                <div
                  key={c.id}
                  role="button"
                  onDoubleClick={() => onSelect(c.id)}
                  title={t('clients.openHint', 'Double-click to open')}
                  className={cn(
                    GRID,
                    'absolute start-0 top-0 w-full cursor-pointer border-b border-border text-sm hover:bg-accent/50'
                  )}
                  style={{ height: `${ROW_HEIGHT}px`, transform: `translateY(${vi.start}px)` }}
                >
                  <span className="flex items-center gap-2 truncate font-medium">
                    {c.name}
                    {c.archived && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {t('clients.archivedBadge', 'Archived')}
                      </span>
                    )}
                  </span>
                  <span className="truncate text-muted-foreground">{c.phone || t('common.none', '—')}</span>
                  <span className="text-end">
                    <BalanceAmount cents={c.balances.USD} />
                  </span>
                  <span className="text-end">
                    <BalanceAmount cents={c.balances.AFN} />
                  </span>
                  <span className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditClient(c)
                        setFormOpen(true)
                      }}
                      title={t('common.edit', 'Edit')}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </span>
                </div>
              )
            })}
          </div>
          {loading && <div className="p-3 text-center text-xs text-muted-foreground">{t('common.loading', 'Loading…')}</div>}
        </div>
      </div>

      <ClientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        client={editClient}
        defaultKind={kind}
        onSaved={refresh}
      />
    </div>
  )
}
