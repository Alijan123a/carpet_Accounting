import * as React from 'react'
import { cn } from '@renderer/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

/** Input types where ↑/↓ keep their native meaning (calendar segments, sliders). */
const NATIVE_ARROW_TYPES = new Set(['date', 'time', 'datetime-local', 'month', 'week', 'range'])

const FOCUSABLE_SELECTOR =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'

/**
 * App-wide arrow-key form navigation: ↑/↓ move focus to the previous/next
 * field (in DOM order) instead of spinning number inputs. Scoped to the
 * nearest dialog when one is open, otherwise the whole page.
 */
function moveFocus(current: HTMLElement, dir: 1 | -1): void {
  const scope = current.closest<HTMLElement>('[role="dialog"]') ?? document.body
  const fields = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    // offsetParent is null for display:none subtrees (e.g. inactive tabs).
    (el) => el.offsetParent !== null
  )
  const idx = fields.indexOf(current)
  const next = idx === -1 ? null : fields[idx + dir]
  if (!next) return
  next.focus()
  // Pre-select existing text so typing overwrites, matching Tab behaviour.
  if (next instanceof HTMLInputElement && !NATIVE_ARROW_TYPES.has(next.type)) next.select()
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onKeyDown, ...props }, ref) => {
    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
      onKeyDown?.(e)
      // A consumer that preventDefaults (e.g. Typeahead's dropdown) keeps the key.
      if (e.defaultPrevented) return
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      if (NATIVE_ARROW_TYPES.has(e.currentTarget.type)) return
      // preventDefault also disables the number input's ↑/↓ increment/decrement.
      e.preventDefault()
      moveFocus(e.currentTarget, e.key === 'ArrowDown' ? 1 : -1)
    }
    return (
      <input
        type={type}
        ref={ref}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-soft ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
