import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Language } from '@renderer/i18n'

export type Theme = 'light' | 'dark'
export type Calendar = 'shamsi' | 'gregorian'

interface SettingsState {
  theme: Theme
  language: Language
  calendar: Calendar
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setLanguage: (language: Language) => void
  setCalendar: (calendar: Calendar) => void
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
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setLanguage: (language) => set({ language }),
      setCalendar: (calendar) => set({ calendar })
    }),
    { name: 'qaleen-settings' }
  )
)
