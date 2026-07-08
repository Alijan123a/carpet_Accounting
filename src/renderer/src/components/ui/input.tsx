import * as React from 'react'
import { cn } from '@renderer/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

/** Input types where ↑/↓ keep their native meaning (calendar segments, sliders). */
const NATIVE_ARROW_TYPES = new Set(['date', 'time', 'datetime-local', 'month', 'week', 'range'])

const FOCUSABLE_SELECTOR =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'

/**
 * App-wide arrow-key form navigation: ↑/↓ move focus to the previous/next
 * field (in DOM order) instead of spinning number inputs; ←/→ do the same
 * when the field is empty or fully selected (otherwise they move the caret
 * as usual). Scoped to the nearest dialog when one is open, otherwise the
 * whole page.
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

/**
 * ←/→ leave the field only when there is no caret position to preserve:
 * empty value or everything selected. Number inputs expose no selection API,
 * so for them we track the select-all state via data-nav-selected (set on
 * focus — both Tab and moveFocus select the content — cleared on click/typing).
 */
function horizontalNavAllowed(el: HTMLInputElement): boolean {
  if (el.value === '') return true
  try {
    const s = el.selectionStart
    const e = el.selectionEnd
    if (s != null && e != null) return s === 0 && e === el.value.length
  } catch {
    /* selection API unsupported for this type — fall through to the flag */
  }
  return el.dataset.navSelected === '1'
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onKeyDown, onFocus, onMouseUp, ...props }, ref) => {
    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
      onKeyDown?.(e)
      // A consumer that preventDefaults (e.g. Typeahead's dropdown) keeps the key.
      if (e.defaultPrevented) return
      const el = e.currentTarget
      const vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown'
      const horizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight'
      // Any other key (typing, Home/End, shift-selection…) ends the
      // "content fully selected" state that permits horizontal navigation.
      if (!vertical && !horizontal) {
        delete el.dataset.navSelected
        return
      }
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) {
        delete el.dataset.navSelected
        return
      }
      if (NATIVE_ARROW_TYPES.has(el.type)) return
      if (vertical) {
        // preventDefault also disables the number input's ↑/↓ increment/decrement.
        e.preventDefault()
        moveFocus(el, e.key === 'ArrowDown' ? 1 : -1)
        return
      }
      if (!horizontalNavAllowed(el)) {
        delete el.dataset.navSelected
        return // let the caret move inside the text
      }
      // "Forward" is the reading direction: ← in an RTL layout, → in LTR.
      const rtl = getComputedStyle(el).direction === 'rtl'
      const forward = (e.key === 'ArrowRight') !== rtl
      e.preventDefault()
      moveFocus(el, forward ? 1 : -1)
    }
    function handleFocus(e: React.FocusEvent<HTMLInputElement>): void {
      // Tab and moveFocus() select the whole value on entry (mouse clicks
      // don't, but mouseup below clears the flag right after this).
      e.currentTarget.dataset.navSelected = '1'
      onFocus?.(e)
    }
    function handleMouseUp(e: React.MouseEvent<HTMLInputElement>): void {
      // A click placed the caret somewhere specific — keep ←/→ for the caret.
      delete e.currentTarget.dataset.navSelected
      onMouseUp?.(e)
    }
    return (
      <input
        type={type}
        ref={ref}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onMouseUp={handleMouseUp}
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
