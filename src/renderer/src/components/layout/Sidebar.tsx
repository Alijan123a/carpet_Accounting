import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import { NAV_ITEMS, type Route } from '@renderer/config/nav'

interface SidebarProps {
  current: Route
  onNavigate: (route: Route) => void
}

export function Sidebar({ current, onNavigate }: SidebarProps): JSX.Element {
  const { t } = useTranslation()

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-e border-border bg-card">
      <div className="flex items-center gap-2 px-5 py-5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg text-lg font-bold text-white"
          style={{ background: 'hsl(var(--laaki))' }}
          aria-hidden
        >
          ق
        </span>
        <div className="leading-tight">
          <div className="text-sm font-semibold">{t('app.name', 'Qaleen Trader')}</div>
          <div className="text-xs text-muted-foreground">
            {t('app.tagline', 'Carpet Accounting')}
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = current === item.key
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {t(item.i18nKey, item.label)}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
