import { useTranslation } from 'react-i18next'
import { NAV_ITEMS, type Route } from '@renderer/config/nav'

export function Placeholder({ route }: { route: Route }): JSX.Element {
  const { t } = useTranslation()
  const item = NAV_ITEMS.find((n) => n.key === route)
  const Icon = item?.icon

  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      {Icon ? <Icon className="mb-4 h-10 w-10 text-muted-foreground" /> : null}
      <h2 className="text-xl font-semibold">
        {item ? t(item.i18nKey, item.label) : ''}
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {t('common.comingSoon', 'This module will be built in a later phase.')}
      </p>
    </div>
  )
}
