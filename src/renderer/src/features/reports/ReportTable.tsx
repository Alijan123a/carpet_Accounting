import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Search } from 'lucide-react'
import { Input } from '@renderer/components/ui/input'
import { SortHeader, type SortState } from '@renderer/components/ui/sort-header'
import { cn } from '@renderer/lib/utils'
import type { RenderedSection } from '@shared/reports'

const ROW_HEIGHT = 36

/** Compare two rendered cells: numerically when both look like numbers/money. */
function compareCells(a: string, b: string): number {
  const na = parseFloat(a.replace(/[^\d.-]/g, ''))
  const nb = parseFloat(b.replace(/[^\d.-]/g, ''))
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
  return a.localeCompare(b)
}

function SectionTable({ section }: { section: RenderedSection }): JSX.Element {
  const { t } = useTranslation()
  const parentRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState>({ by: '', dir: 'asc' })

  // Report data is already fully in memory (it was just generated), so search
  // and sort are done client-side without re-running the report.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = q ? section.rows.filter((r) => r.some((cell) => cell.toLowerCase().includes(q))) : section.rows
    const ci = Number(sort.by)
    if (sort.by !== '' && Number.isInteger(ci) && ci >= 0 && ci < section.columns.length) {
      out = [...out].sort((ra, rb) => {
        const c = compareCells(ra[ci] ?? '', rb[ci] ?? '')
        return sort.dir === 'asc' ? c : -c
      })
    }
    return out
  }, [section, query, sort])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })
  const template = `repeat(${section.columns.length}, minmax(0, 1fr))`

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-3 py-2">
        <span className="text-sm font-semibold">{section.title ?? ''}</span>
        <div className="relative">
          <Search className="pointer-events-none absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('reports.searchRows', 'Search rows…')}
            className="h-8 w-48 ps-7 text-xs"
          />
        </div>
      </div>
      <div className="grid border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground" style={{ gridTemplateColumns: template }}>
        {section.columns.map((c, i) => (
          <SortHeader
            key={i}
            col={String(i)}
            sort={sort}
            onSort={setSort}
            align={c.align === 'end' ? 'end' : 'start'}
            className="px-3 py-2"
          >
            {c.label}
          </SortHeader>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          {t('reports.noData', 'No data for the selected filters.')}
        </div>
      ) : (
        <div ref={parentRef} className="max-h-[55vh] overflow-auto">
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index]
              return (
                <div
                  key={vi.index}
                  className="absolute start-0 top-0 grid w-full border-b border-border text-sm"
                  style={{ height: `${ROW_HEIGHT}px`, transform: `translateY(${vi.start}px)`, gridTemplateColumns: template }}
                >
                  {row.map((value, ci) => (
                    <span
                      key={ci}
                      title={value}
                      className={cn(
                        'truncate px-3 py-2',
                        section.columns[ci].align === 'end' ? 'text-end font-mono tabular-nums' : 'text-start'
                      )}
                    >
                      {value}
                    </span>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {section.footer && (
        <div className="grid border-t-2 border-border bg-muted/40 text-sm font-semibold" style={{ gridTemplateColumns: template }}>
          {section.footer.map((value, ci) => (
            <span
              key={ci}
              className={cn(
                'truncate px-3 py-2',
                section.columns[ci].align === 'end' ? 'text-end font-mono tabular-nums' : 'text-start'
              )}
            >
              {value}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function ReportTable({ sections }: { sections: RenderedSection[] }): JSX.Element {
  return (
    <div className="space-y-4">
      {sections.map((s, i) => (
        <SectionTable key={i} section={s} />
      ))}
    </div>
  )
}
