import { useEffect, useMemo, useRef, useState } from 'react'
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

  // Close the dropdown on an outside click.
  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent): void {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  function choose(item: T): void {
    onSelect(item)
    setOpen(false)
  }

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
      {open && matches.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-card py-1 text-sm shadow-card"
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
      )}
      {open && value.trim() !== '' && matches.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-center text-xs text-muted-foreground shadow-card">
          {t('common.noResults', 'No results found.')}
        </div>
      )}
    </div>
  )
}
