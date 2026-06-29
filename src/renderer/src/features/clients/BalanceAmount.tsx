import { formatCents } from '@shared/accounting'
import { cn } from '@renderer/lib/utils'

/**
 * Render a signed balance amount with meaning-coloring (CLAUDE.md §6):
 *   > 0  client owes us  -> green (receivable)
 *   < 0  we owe client   -> red   (payable)
 *   = 0  settled         -> muted
 * Display only; rounded to 2 decimals. AFN and USD are shown in separate cells.
 */
export function BalanceAmount({ cents, className }: { cents: number; className?: string }): JSX.Element {
  const color =
    cents > 0
      ? 'text-green-600 dark:text-green-400'
      : cents < 0
        ? 'text-red-600 dark:text-red-400'
        : 'text-muted-foreground'
  return <span className={cn('font-mono tabular-nums', color, className)}>{formatCents(cents)}</span>
}
