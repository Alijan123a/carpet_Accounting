import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { useSettings, type Theme, type Calendar } from '@renderer/store/settings'
import type { Language } from '@renderer/i18n'

function Field({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6 rounded-lg border border-border bg-card p-4">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  )
}

export function Settings(): JSX.Element {
  const { t } = useTranslation()
  const { theme, language, calendar, setTheme, setLanguage, setCalendar } = useSettings()
  const [version, setVersion] = useState('0.1.0')

  useEffect(() => {
    window.api?.getVersion().then(setVersion).catch(() => undefined)
  }, [])

  const themes: { value: Theme; label: string }[] = [
    { value: 'light', label: t('settings.light', 'Light') },
    { value: 'dark', label: t('settings.dark', 'Dark') }
  ]
  const languages: { value: Language; label: string }[] = [
    { value: 'fa', label: 'دری / فارسی' },
    { value: 'en', label: 'English' }
  ]
  const calendars: { value: Calendar; label: string }[] = [
    { value: 'shamsi', label: t('settings.shamsi', 'Hijri Shamsi') },
    { value: 'gregorian', label: t('settings.gregorian', 'Gregorian') }
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{t('settings.title', 'Settings')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('settings.subtitle', 'Preferences are saved automatically.')}
        </p>
      </div>

      <Field
        title={t('settings.theme', 'Theme')}
        description={t('settings.themeDesc', 'Switch between light and dark mode.')}
      >
        {themes.map((opt) => (
          <Button
            key={opt.value}
            variant={theme === opt.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTheme(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </Field>

      <Field
        title={t('settings.language', 'Language')}
        description={t('settings.languageDesc', 'Changes the language and text direction (RTL/LTR).')}
      >
        {languages.map((opt) => (
          <Button
            key={opt.value}
            variant={language === opt.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLanguage(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </Field>

      <Field
        title={t('settings.calendar', 'Calendar')}
        description={t('settings.calendarDesc', 'Calendar used to display dates across the app.')}
      >
        {calendars.map((opt) => (
          <Button
            key={opt.value}
            variant={calendar === opt.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCalendar(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </Field>

      <div className="px-1 text-xs text-muted-foreground">
        {t('settings.version', 'Version')}: {version}
      </div>
    </div>
  )
}
