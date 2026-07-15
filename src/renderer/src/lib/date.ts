import { format } from 'date-fns'
import { format as formatJalali } from 'date-fns-jalali'
import type { Calendar } from '@renderer/store/settings'

/**
 * Format a timestamp according to the calendar chosen in Settings:
 * Hijri Shamsi (Jalali) or Gregorian. (CLAUDE.md §5 dual calendar.)
 */
export function formatDate(epochMs: number, calendar: Calendar): string {
  const d = new Date(epochMs)
  return calendar === 'shamsi' ? formatJalali(d, 'yyyy/MM/dd') : format(d, 'yyyy/MM/dd')
}

export function formatDateTime(epochMs: number, calendar: Calendar): string {
  const d = new Date(epochMs)
  return calendar === 'shamsi' ? formatJalali(d, 'yyyy/MM/dd HH:mm') : format(d, 'yyyy/MM/dd HH:mm')
}

/**
 * Convert a native <input type="date"> value (always Gregorian "yyyy-mm-dd") to
 * an inclusive epoch-ms range bound. Used for the from/to statement filters.
 */
export function startOfDayEpoch(value: string): number | null {
  if (!value) return null
  const t = new Date(`${value}T00:00:00`).getTime()
  return Number.isNaN(t) ? null : t
}

/** Epoch-ms → the Gregorian "yyyy-MM-dd" value a date input expects. */
export function epochToDateInput(epochMs: number): string {
  return format(new Date(epochMs), 'yyyy-MM-dd')
}

export function endOfDayEpoch(value: string): number | null {
  if (!value) return null
  const t = new Date(`${value}T23:59:59.999`).getTime()
  return Number.isNaN(t) ? null : t
}
