import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Plus, Archive, ArchiveRestore } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { SortHeader, type SortState } from '@renderer/components/ui/sort-header'
import { cn } from '@renderer/lib/utils'
import { formatCents } from '@shared/accounting'
import type { MaterialListItem } from '@shared/contracts'
import { MaterialFormDialog } from './MaterialFormDialog'

const PAGE_SIZE = 100
const ROW_HEIGHT = 48
const GRID = 'grid grid-cols-[1fr_64px_110px_110px_110px_120px_56px] items-center gap-3 px-4'

const kg = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 3 })

export function MaterialsList({ onSelect }: { onSelect: (id: number) => void }): JSX.Element {
  const { t } = useTranslation()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [sort, setSort] = useState<SortState>({ by: 'name', dir: 'asc' })
  const [rows, setRows] = useState<MaterialListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)

  const rowsRef = useRef<MaterialListItem[]>([])
  const loadingRef = useRef(false)
  rowsRef.current = rows

  useEffect(() => {
    const h = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(h)
  }, [searchInput])

  const fetchPage = useCallback(
    async (reset: boolean): Promise<void> => {
      if (loadingRef.current) return
      loadingRef.current = true
      setLoading(true)
      try {
        const offset = reset ? 0 : rowsRef.current.length
        const res = await window.api.materials.list({
          search,
          includeArchived,
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
    [search, includeArchived, sort]
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
  }

  async function toggleArchive(m: MaterialListItem): Promise<void> {
    if (m.archived) await window.api.materials.restore(m.id)
    else await window.api.materials.archive(m.id)
    refresh()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('material.title', 'Material (Tar)')}</h2>
          <p className="text-xs text-muted-foreground">{t('material.total', { total, defaultValue: '{{total}} total' })}</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('material.addLot', 'Add material')}
        </Button>
      </div>

      <div className="mb-3 flex items-center gap-4">
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('material.searchPlaceholder', 'Search material…')}
          className="h-9 max-w-xs"
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        <div className={cn(GRID, 'h-9 shrink-0 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground')}>
          <SortHeader col="name" sort={sort} onSort={setSort}>
            {t('material.name', 'Name')}
          </SortHeader>
          <SortHeader col="currency" sort={sort} onSort={setSort}>
            {t('material.currency', 'Cur')}
          </SortHeader>
          <span className="text-end">{t('material.boughtKg', 'Bought')}</span>
          <span className="text-end">{t('material.soldKg', 'Sold')}</span>
          <SortHeader col="stockKg" sort={sort} onSort={setSort} align="end">
            {t('material.stock', 'Stock')}
          </SortHeader>
          <span className="text-end">{t('material.profit', 'Profit')}</span>
          <span />
        </div>
        <div ref={parentRef} onScroll={onScroll} className="flex-1 overflow-auto">
          {rows.length === 0 && !loading && (
            <div className="p-8 text-center text-sm text-muted-foreground">{t('material.empty', 'No materials found.')}</div>
          )}
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const m = rows[vi.index]
              return (
                <div
                  key={m.id}
                  role="button"
                  onClick={() => onSelect(m.id)}
                  className={cn(GRID, 'absolute start-0 top-0 w-full cursor-pointer border-b border-border text-sm hover:bg-accent/50')}
                  style={{ height: `${ROW_HEIGHT}px`, transform: `translateY(${vi.start}px)` }}
                >
                  <span className="flex items-center gap-2 truncate font-medium">
                    {m.name}
                    {m.archived && (
                      <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                        {t('clients.archivedBadge', 'Archived')}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground">{m.currency}</span>
                  <span className="text-end font-mono tabular-nums text-muted-foreground">{kg(m.boughtKg)}</span>
                  <span className="text-end font-mono tabular-nums text-muted-foreground">{kg(m.soldKg)}</span>
                  <span className="text-end font-mono tabular-nums">{kg(m.stockKg)}</span>
                  <span
                    className={cn(
                      'text-end font-mono tabular-nums',
                      m.profitCents > 0 ? 'text-green-600 dark:text-green-400' : m.profitCents < 0 ? 'text-red-600 dark:text-red-400' : ''
                    )}
                  >
                    {formatCents(m.profitCents)}
                  </span>
                  <span className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={m.archived ? t('common.restore', 'Restore') : t('common.archive', 'Archive')}
                      onClick={(e) => {
                        e.stopPropagation()
                        void toggleArchive(m)
                      }}
                    >
                      {m.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                    </Button>
                  </span>
                </div>
              )
            })}
          </div>
          {loading && <div className="p-3 text-center text-xs text-muted-foreground">{t('common.loading', 'Loading…')}</div>}
        </div>
      </div>

      <MaterialFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={(id) => {
          refresh()
          onSelect(id)
        }}
      />
    </div>
  )
}
