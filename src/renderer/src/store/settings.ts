import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Language } from '@renderer/i18n'
import type { Currency } from '@shared/accounting'

export type Theme = 'light' | 'dark'
export type Calendar = 'shamsi' | 'gregorian'

interface SettingsState {
  theme: Theme
  language: Language
  calendar: Calendar
  /** Default currency pre-selected for new entries. */
  defaultCurrency: Currency
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setLanguage: (language: Language) => void
  setCalendar: (calendar: Calendar) => void
  setDefaultCurrency: (currency: Currency) => void
}

/**
 * User preferences (theme + language), persisted to localStorage so the
 * choices survive app restarts. This is the single source of truth that both
 * the top-bar toggles and the Settings page read from and write to.
 */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'light',
      language: 'fa',
      calendar: 'shamsi',
      defaultCurrency: 'AFN',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setLanguage: (language) => set({ language }),
      setCalendar: (calendar) => set({ calendar }),
      setDefaultCurrency: (defaultCurrency) => set({ defaultCurrency })
    }),
    { name: 'carpet-accounting-settings' }
  )
)
