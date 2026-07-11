import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import { NAV_ITEMS, type Route } from '@renderer/config/nav'

interface SidebarProps {
  current: Route
  onNavigate: (route: Route) => void
}

export function Sidebar({ current, onNavigate }: SidebarProps): JSX.Element {
  const { t } = useTranslation()
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.api
      .getVersion()
      .then(setVersion)
      .catch(() => undefined)
  }, [])

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-e border-border/60 bg-sidebar">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gradient text-xl font-bold text-white shadow-glow"
          aria-hidden
        >
          ق
        </span>
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight">{t('app.name', 'Carpet Accounting')}</div>
          <div className="text-xs text-muted-foreground">
            {t('app.tagline', 'Carpet Accounting')}
          </div>
        </div>
      </div>

      <div className="mx-5 mb-1 h-px bg-border/70" />

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = current === item.key
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                active
                  ? 'bg-brand-gradient text-white shadow-glow'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                  active ? 'bg-white/20' : 'bg-muted/60 text-muted-foreground group-hover:bg-background/60'
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="truncate">{t(item.i18nKey, item.label)}</span>
            </button>
          )
        })}
      </nav>

      <div className="px-5 py-4 text-[11px] text-muted-foreground/70">
        {t('app.name', 'Carpet Accounting')}
        {version ? ` · v${version}` : ''}
      </div>
    </aside>
  )
}
