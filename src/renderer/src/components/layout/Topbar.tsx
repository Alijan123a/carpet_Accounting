import { useTranslation } from 'react-i18next'
import { ThemeToggle } from '@renderer/components/ThemeToggle'
import { LanguageToggle } from '@renderer/components/LanguageToggle'
import { NAV_ITEMS, type Route } from '@renderer/config/nav'

export function Topbar({ current }: { current: Route }): JSX.Element {
  const { t } = useTranslation()
  const item = NAV_ITEMS.find((n) => n.key === current)

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-6">
      <h1 className="text-base font-semibold">
        {item ? t(item.i18nKey, item.label) : ''}
      </h1>
      <div className="flex items-center gap-1">
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </header>
  )
}
