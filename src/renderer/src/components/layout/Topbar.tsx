import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDays } from 'lucide-react'
import { format } from 'date-fns'
import { format as formatJalali } from 'date-fns-jalali'
import { ThemeToggle } from '@renderer/components/ThemeToggle'
import { LanguageToggle } from '@renderer/components/LanguageToggle'
import { useSettings } from '@renderer/store/settings'
import { NAV_ITEMS, type Route } from '@renderer/config/nav'

export function Topbar({ current }: { current: Route }): JSX.Element {
  const { t } = useTranslation()
  const calendar = useSettings((s) => s.calendar)
  const item = NAV_ITEMS.find((n) => n.key === current)

  // Calendar-aware "today" label (Hijri Shamsi or Gregorian, per Settings).
  const today = useMemo(() => {
    const now = new Date()
    return calendar === 'shamsi'
      ? formatJalali(now, 'EEEE، d MMMM yyyy')
      : format(now, 'EEEE, d MMMM yyyy')
  }, [calendar])

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border/60 bg-card/70 px-6 backdrop-blur-md">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-bold tracking-tight">
          {item ? t(item.i18nKey, item.label) : ''}
        </h1>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          <span className="truncate">{today}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </header>
  )
}
