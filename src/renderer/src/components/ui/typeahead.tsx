import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'

export interface TypeaheadItem {
  id: number | string
  label: string
  /** Optional secondary text shown dimmed (e.g. a phone number). */
  sublabel?: string
}

interface TypeaheadProps<T extends TypeaheadItem> {
  /** Current text in the field (controlled by the parent). */
  value: string
  onValueChange: (text: string) => void
  /** Candidate pool; filtered here by case-insensitive substring. */
  items: T[]
  onSelect: (item: T) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Max suggestions to show at once. */
  limit?: number
  autoFocus?: boolean
}

/**
 * Lightweight autocomplete: an {@link Input} plus a filtered dropdown, built
 * from existing primitives (no new dependency). Typing filters `items` by
 * case-insensitive SUBSTRING over label + sublabel — typing "a" surfaces every
 * item containing "a" — and picking one fires `onSelect`. Keyboard: ↑/↓ to move,
 * Enter to choose the highlighted row, Esc to close. RTL-safe (logical classes).
 */
export function Typeahead<T extends TypeaheadItem>({
  value,
  onValueChange,
  items,
  onSelect,
  placeholder,
  disabled,
  className,
  limit = 50,
  autoFocus
}: TypeaheadProps<T>): JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Viewport-space anchor of the input; the dropdown is PORTALED to <body> in
  // fixed position so it can never be clipped by a scrolling/overflow ancestor
  // (e.g. the invoice line grids, which scroll both axes).
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null)

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase()
    const pool = q
      ? items.filter(
          (it) =>
            it.label.toLowerCase().includes(q) || (it.sublabel?.toLowerCase().includes(q) ?? false)
        )
      : items
    return pool.slice(0, limit)
  }, [items, value, limit])

  // Reset the highlighted row whenever the visible matches change.
  useEffect(() => setHighlight(0), [value, open])

  // Close the dropdown on an outside click (outside the input AND the portal).
  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent): void {
      const target = e.target as Node
      if (wrapRef.current?.contains(target) || listRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  // Track the input's viewport position every frame while open. rAF (instead
  // of scroll/resize listeners) also follows the dialog's open animation —
  // the input is still moving during the zoom-in, and a one-shot measurement
  // would leave the dropdown hanging where the input USED to be.
  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null)
      return
    }
    let raf = 0
    const track = (): void => {
      const el = wrapRef.current
      if (el) {
        const r = el.getBoundingClientRect()
        // Functional update returning the same reference when nothing moved,
        // so the per-frame tracking does not re-render.
        setAnchor((prev) =>
          prev && prev.top === r.bottom && prev.left === r.left && prev.width === r.width
            ? prev
            : { top: r.bottom, left: r.left, width: r.width }
        )
      }
      raf = requestAnimationFrame(track)
    }
    track()
    return () => cancelAnimationFrame(raf)
  }, [open])

  function choose(item: T): void {
    onSelect(item)
    setOpen(false)
  }

  // Dropdown geometry: at least the input's width, widened to a readable
  // minimum for narrow grid columns, and clamped inside the viewport.
  const dropWidth = anchor ? Math.min(Math.max(anchor.width, 240), window.innerWidth - 16) : 0
  const dropLeft = anchor ? Math.max(8, Math.min(anchor.left, window.innerWidth - dropWidth - 8)) : 0

  function onKeyDown(e: React.KeyboardEvent): void {
    // With no suggestions to navigate, leave ↑/↓ to the app-wide field
    // navigation in <Input> (which only acts when we do NOT preventDefault).
    if (!matches.length) {
      if (e.key === 'Escape') setOpen(false)
      return
    }
    if (!open && e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      return
    }
    // Closed + ArrowUp falls through: the global nav moves to the previous field.
    if (!open && e.key === 'ArrowUp') return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && matches[highlight]) {
        e.preventDefault()
        choose(matches[highlight])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <Input
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open &&
        anchor &&
        (matches.length > 0 || value.trim() !== '') &&
        createPortal(
          <div
            ref={listRef}
            data-typeahead-portal
            // pointerEvents: Radix's modal Dialog puts pointer-events:none on
            // <body>; this portal lives in <body>, so re-enable it explicitly.
            style={{
              position: 'fixed',
              top: anchor.top + 4,
              left: dropLeft,
              width: dropWidth,
              zIndex: 60,
              pointerEvents: 'auto'
            }}
          >
            {matches.length > 0 ? (
              <ul
                role="listbox"
                className="max-h-56 overflow-auto rounded-lg border border-border bg-card py-1 text-sm shadow-card"
              >
                {matches.map((item, i) => (
                  <li
                    key={item.id}
                    role="option"
                    aria-selected={i === highlight}
                    // onMouseDown (not onClick) so selection wins the race with the input's blur.
                    onMouseDown={(e) => {
                      e.preventDefault()
                      choose(item)
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5',
                      i === highlight ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                    )}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.sublabel && (
                      <span className="shrink-0 text-xs text-muted-foreground">{item.sublabel}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-lg border border-border bg-card px-3 py-2 text-center text-xs text-muted-foreground shadow-card">
                {t('common.noResults', 'No results found.')}
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  )
}
