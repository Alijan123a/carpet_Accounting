import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format as formatGregorian } from 'date-fns'
import {
  format as formatJalali,
  newDate as jalaliDate,
  getDaysInMonth as daysInJalaliMonth
} from 'date-fns-jalali'
import { X } from 'lucide-react'
import { Input } from './input'
import { cn } from '@renderer/lib/utils'
import { useSettings, type Calendar } from '@renderer/store/settings'

/**
 * Afghan (Dari) Solar Hijri month names, with English transliterations.
 * (Afghan months differ from the Iranian names: حمل، ثور، … not فروردین.)
 */
const JALALI_MONTHS_FA = [
  'حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله',
  'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت'
]
const JALALI_MONTHS_EN = [
  'Hamal', 'Sawr', 'Jawza', 'Saratan', 'Asad', 'Sunbula',
  'Mizan', 'Aqrab', 'Qaws', 'Jadi', 'Dalwa', 'Hut'
]

interface JalaliParts {
  jy: number
  jm: number // 1-based
  jd: number
}

/** Decompose a Gregorian "yyyy-MM-dd" string into Jalali parts (null if empty/invalid). */
function toJalaliParts(value: string): JalaliParts | null {
  if (!value) return null
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return {
    jy: parseInt(formatJalali(d, 'yyyy'), 10),
    jm: parseInt(formatJalali(d, 'MM'), 10),
    jd: parseInt(formatJalali(d, 'dd'), 10)
  }
}

/** Compose Jalali parts back into a Gregorian "yyyy-MM-dd" string (day clamped to month length). */
function fromJalaliParts(p: JalaliParts): string {
  const maxDay = daysInJalaliMonth(jalaliDate(p.jy, p.jm - 1, 1))
  const jd = Math.min(p.jd, maxDay)
  return formatGregorian(jalaliDate(p.jy, p.jm - 1, jd), 'yyyy-MM-dd')
}

export interface DateInputProps {
  /** Gregorian "yyyy-MM-dd" — the exact contract of a native `<input type="date">`. */
  value: string
  onChange: (value: string) => void
  /** Applied to the wrapper (use for width/height, e.g. "h-9 w-40"). */
  className?: string
  disabled?: boolean
}

/**
 * Date entry with a per-field Hijri Shamsi ⇄ Gregorian toggle (CLAUDE.md §5 dual
 * calendar). The stored value is ALWAYS a Gregorian "yyyy-MM-dd" string, so this
 * is a drop-in replacement for `<Input type="date">`; only the entry UI changes.
 * The field starts in the calendar chosen in Settings.
 */
export function DateInput({ value, onChange, className, disabled }: DateInputProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const settingsCalendar = useSettings((s) => s.calendar)
  const [mode, setMode] = useState<Calendar>(settingsCalendar)

  const jParts = useMemo(() => toJalaliParts(value), [value])
  const todayJ = useMemo(() => toJalaliParts(formatGregorian(new Date(), 'yyyy-MM-dd'))!, [])
  const months = i18n.language.startsWith('fa') ? JALALI_MONTHS_FA : JALALI_MONTHS_EN

  // Year dropdown: a wide window around today (old ledgers + future due dates).
  const years = useMemo(() => {
    const list: number[] = []
    for (let y = todayJ.jy + 2; y >= todayJ.jy - 100; y--) list.push(y)
    return list
  }, [todayJ.jy])

  const daysInMonth = jParts ? daysInJalaliMonth(jalaliDate(jParts.jy, jParts.jm - 1, 1)) : 31

  function setPart(part: keyof JalaliParts, raw: string): void {
    if (!raw) return
    // Picking any part of an empty field starts from today.
    const base = jParts ?? todayJ
    onChange(fromJalaliParts({ ...base, [part]: parseInt(raw, 10) }))
  }

  // Each dropdown is a borderless, transparent SEGMENT — the bordered look
  // comes from the shared wrapper below, so the whole thing reads as one field.
  const segCls =
    'h-full min-w-0 cursor-pointer bg-transparent px-1 text-sm text-foreground focus:outline-none disabled:cursor-not-allowed'

  return (
    <div className={cn('flex h-10 items-stretch gap-1', className)}>
      {mode === 'gregorian' ? (
        <Input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-full min-w-0 flex-1"
        />
      ) : (
        // Styled to match the Gregorian <input type="date"> box: a single
        // bordered, rounded field with day/month/year as inline segments
        // (same border, height, background, shadow and focus ring as Input).
        <div
          className={cn(
            'flex h-full min-w-0 flex-1 items-stretch rounded-lg border border-input bg-card px-1 shadow-soft ring-offset-background transition-colors',
            'focus-within:border-ring focus-within:outline-none focus-within:ring-2 focus-within:ring-ring/40 focus-within:ring-offset-1',
            disabled && 'opacity-50'
          )}
        >
          <select
            value={jParts?.jd ?? ''}
            onChange={(e) => setPart('jd', e.target.value)}
            disabled={disabled}
            className={cn(segCls, 'w-[44px]')}
            aria-label={t('date.day', 'Day')}
          >
            <option value="" disabled>
              {t('date.day', 'Day')}
            </option>
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={jParts?.jm ?? ''}
            onChange={(e) => setPart('jm', e.target.value)}
            disabled={disabled}
            className={cn(segCls, 'min-w-[64px] flex-1')}
            aria-label={t('date.month', 'Month')}
          >
            <option value="" disabled>
              {t('date.month', 'Month')}
            </option>
            {months.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={jParts?.jy ?? ''}
            onChange={(e) => setPart('jy', e.target.value)}
            disabled={disabled}
            className={cn(segCls, 'w-[64px]')}
            aria-label={t('date.year', 'Year')}
          >
            <option value="" disabled>
              {t('date.year', 'Year')}
            </option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {value && !disabled && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="flex shrink-0 items-center px-0.5 text-muted-foreground hover:text-foreground"
              title={t('date.clear', 'Clear')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setMode((m) => (m === 'shamsi' ? 'gregorian' : 'shamsi'))}
        className="shrink-0 rounded-lg border border-input bg-card px-1.5 text-[10px] font-medium text-muted-foreground shadow-soft hover:text-foreground disabled:opacity-50"
        title={t('date.switchCalendar', 'Switch calendar (Shamsi / Gregorian)')}
      >
        {mode === 'shamsi' ? t('date.shamsiShort', 'شمسی') : t('date.gregorianShort', 'میلادی')}
      </button>
    </div>
  )
}
