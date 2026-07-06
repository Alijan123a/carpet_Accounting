import type { ReactNode } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import type { SortDir } from '@shared/contracts'

export interface SortState {
  by: string
  dir: SortDir
}

/**
 * Clickable column header for the grid-based tables. Click cycles the sort:
 * another column → this column asc → desc. The actual ordering happens in the
 * main process (SQL ORDER BY, whitelisted) or client-side for in-memory tables.
 */
export function SortHeader({
  col,
  sort,
  onSort,
  children,
  align = 'start',
  className
}: {
  col: string
  sort: SortState
  onSort: (next: SortState) => void
  children: ReactNode
  align?: 'start' | 'end'
  className?: string
}): JSX.Element {
  const active = sort.by === col
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ChevronUp : ChevronDown
  return (
    <button
      type="button"
      onClick={() => onSort({ by: col, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}
      className={cn(
        'flex min-w-0 items-center gap-0.5 truncate text-xs font-medium hover:text-foreground',
        align === 'end' && 'justify-end',
        active ? 'text-foreground' : 'text-muted-foreground',
        className
      )}
    >
      <span className="truncate">{children}</span>
      <Icon className={cn('h-3 w-3 shrink-0', !active && 'opacity-40')} />
    </button>
  )
}
