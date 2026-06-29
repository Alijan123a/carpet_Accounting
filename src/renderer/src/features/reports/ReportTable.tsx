import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@renderer/lib/utils'
import type { RenderedSection } from '@shared/reports'

const ROW_HEIGHT = 36

function SectionTable({ section }: { section: RenderedSection }): JSX.Element {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: section.rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })
  const template = `repeat(${section.columns.length}, minmax(0, 1fr))`

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {section.title && (
        <div className="border-b border-border bg-card px-3 py-2 text-sm font-semibold">{section.title}</div>
      )}
      <div className="grid border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground" style={{ gridTemplateColumns: template }}>
        {section.columns.map((c, i) => (
          <span key={i} className={cn('truncate px-3 py-2', c.align === 'end' ? 'text-end' : 'text-start')}>
            {c.label}
          </span>
        ))}
      </div>

      {section.rows.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">—</div>
      ) : (
        <div ref={parentRef} className="max-h-[55vh] overflow-auto">
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const row = section.rows[vi.index]
              return (
                <div
                  key={vi.index}
                  className="absolute start-0 top-0 grid w-full border-b border-border text-sm"
                  style={{ height: `${ROW_HEIGHT}px`, transform: `translateY(${vi.start}px)`, gridTemplateColumns: template }}
                >
                  {row.map((value, ci) => (
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
