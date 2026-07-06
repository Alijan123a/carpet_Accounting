import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Undo2, CheckCircle2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { SortHeader, type SortState } from '@renderer/components/ui/sort-header'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/store/settings'
import { formatDateTime } from '@renderer/lib/date'
import type { SystemChangeView, ChangeEntity, UndoFailReason } from '@shared/contracts'

const PAGE_SIZE = 100
const ROW_HEIGHT = 48
const GRID = 'grid grid-cols-[140px_110px_110px_minmax(200px,1fr)_120px] items-center gap-3 px-4'

const ENTITIES: (ChangeEntity | 'all')[] = [
  'all',
  'client',
  'carpet',
  'material',
  'material_line',
  'expense',
  'order',
  'carpet_status',
  'transaction',
  'invoice'
]

/**
 * «تغییرات سیستم» — every mutation the app performed, newest first, with Undo.
 * Undo restores profile snapshots and undoes money via reversal transactions
 * (the ledger itself is never edited or deleted).
 */
export function SystemChangesPage(): JSX.Element {
  const { t } = useTranslation()
  const calendar = useSettings((s) => s.calendar)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [entity, setEntity] = useState<ChangeEntity | 'all'>('all')
  const [sort, setSort] = useState<SortState>({ by: 'id', dir: 'desc' })
  const [rows, setRows] = useState<SystemChangeView[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [undoTarget, setUndoTarget] = useState<SystemChangeView | null>(null)
  const [undoError, setUndoError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const rowsRef = useRef<SystemChangeView[]>([])
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
        const res = await window.api.system.list({
          search,
          entity,
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
    [search, entity, sort]
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

  function undoFailMessage(reason?: UndoFailReason): string {
    switch (reason) {
      case 'already_undone':
        return t('changes.failAlreadyUndone', 'This change was already undone.')
      case 'is_undo':
        return t('changes.failIsUndo', 'An undo cannot itself be undone.')
      case 'not_latest':
        return t('changes.failNotLatest', 'Newer changes exist for this record — undo those first.')
      case 'has_records':
        return t('changes.failHasRecords', 'The record now has linked data and cannot be removed.')
      case 'in_use':
        return t('changes.failInUse', 'The record is in use and cannot be removed.')
      default:
        return t('changes.failGeneric', 'This change cannot be undone.')
    }
  }

  async function doUndo(): Promise<void> {
    if (!undoTarget) return
    setBusy(true)
    setUndoError(null)
    try {
      const res = await window.api.system.undo(undoTarget.id)
      if (!res.ok) {
        setUndoError(undoFailMessage(res.reason))
        return
      }
      setUndoTarget(null)
      void fetchPage(true)
    } catch (e) {
      setUndoError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const entityLabel = (e: ChangeEntity): string => t(`changes.entity.${e}`, e)
  const actionLabel = (a: SystemChangeView['action']): string => t(`changes.action.${a}`, a)

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h2 className="text-2xl font-bold tracking-tight">{t('changes.title', 'System changes')}</h2>
        <p className="text-xs text-muted-foreground">
          {t('changes.subtitle', 'Every change made in the app, newest first. Undo restores data safely — money is corrected by reversal, never by editing history.')}
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('changes.searchPlaceholder', 'Search changes…')}
          className="h-9 max-w-xs"
        />
        <select
          value={entity}
          onChange={(e) => setEntity(e.target.value as ChangeEntity | 'all')}
          className="h-9 rounded-lg border border-input bg-card shadow-soft px-2 text-sm"
        >
          {ENTITIES.map((e) => (
            <option key={e} value={e}>
              {e === 'all' ? t('common.all', 'All') : entityLabel(e)}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {t('changes.total', { total, defaultValue: '{{total}} changes' })}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        <div className={cn(GRID, 'h-9 shrink-0 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground')}>
          <SortHeader col="id" sort={sort} onSort={setSort}>
            {t('changes.when', 'When')}
          </SortHeader>
          <span>{t('changes.entityCol', 'Section')}</span>
          <span>{t('changes.actionCol', 'Action')}</span>
          <span>{t('changes.summaryCol', 'Details')}</span>
          <span className="text-end">{t('changes.undoCol', 'Undo')}</span>
        </div>
        <div ref={parentRef} onScroll={onScroll} className="flex-1 overflow-auto">
          {rows.length === 0 && !loading && (
            <div className="p-8 text-center text-sm text-muted-foreground">{t('changes.empty', 'No changes recorded yet.')}</div>
          )}
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const c = rows[vi.index]
              const isUndoRow = c.undoOfChangeId != null || c.action === 'undo'
              return (
                <div
                  key={c.id}
                  className={cn(GRID, 'absolute start-0 top-0 w-full border-b border-border text-sm', c.undoneAt != null && 'opacity-60')}
                  style={{ height: `${ROW_HEIGHT}px`, transform: `translateY(${vi.start}px)` }}
                >
                  <span className="text-xs text-muted-foreground">{formatDateTime(c.createdAt, calendar)}</span>
                  <span className="truncate">{entityLabel(c.entity)}</span>
                  <span className="truncate">{actionLabel(c.action)}</span>
                  <span className="truncate" title={c.summary}>
                    {c.summary}
                  </span>
                  <span className="flex items-center justify-end gap-1">
                    {c.undoneAt != null ? (
                      <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        <CheckCircle2 className="h-3 w-3" />
                        {t('changes.undoneBadge', 'Undone')}
                      </span>
                    ) : isUndoRow ? (
                      <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-accent-foreground">
                        {t('changes.undoBadge', 'Undo')}
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setUndoError(null)
                          setUndoTarget(c)
                        }}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        {t('changes.undo', 'Undo')}
                      </Button>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
          {loading && <div className="p-3 text-center text-xs text-muted-foreground">{t('common.loading', 'Loading…')}</div>}
        </div>
      </div>

      <ConfirmDialog
        open={undoTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setUndoTarget(null)
            setUndoError(null)
          }
        }}
        title={t('changes.undoConfirmTitle', 'Undo this change?')}
        body={
          undoError ??
          (undoTarget
            ? `${entityLabel(undoTarget.entity)} · ${actionLabel(undoTarget.action)} — ${undoTarget.summary}`
            : undefined)
        }
        confirmLabel={t('changes.undo', 'Undo')}
        destructive
        busy={busy}
        onConfirm={doUndo}
      />
    </div>
  )
}
