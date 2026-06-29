import { useEffect, type ReactNode } from 'react'
import i18n from '@renderer/i18n'
import { useSettings } from '@renderer/store/settings'

/**
 * Applies the persisted user settings to the document:
 *  - theme  -> toggles the `dark` class on <html> (light/dark mode)
 *  - language -> sets <html dir> (rtl for Farsi, ltr for English), <html lang>,
 *                and switches the active i18next language.
 *
 * This is the app-wide direction + theme provider; it owns the side effects so
 * the rest of the UI just reads/writes the settings store.
 */
export function AppSettingsProvider({ children }: { children: ReactNode }): JSX.Element {
  const theme = useSettings((s) => s.theme)
  const language = useSettings((s) => s.language)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    const dir = language === 'fa' ? 'rtl' : 'ltr'
    document.documentElement.setAttribute('dir', dir)
    document.documentElement.setAttribute('lang', language)
    if (i18n.language !== language) {
      void i18n.changeLanguage(language)
    }
  }, [language])

  return <>{children}</>
}
