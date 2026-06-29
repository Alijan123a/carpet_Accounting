import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import fa from './locales/fa.json'
import en from './locales/en.json'

export const SUPPORTED_LANGUAGES = ['fa', 'en'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

// Locale files are intentionally empty in Phase 0 and filled in later phases.
// Until then, components pass an English default string as the second t() arg.
i18n.use(initReactI18next).init({
  resources: {
    fa: { translation: fa },
    en: { translation: en }
  },
  lng: 'fa',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  },
  returnNull: false
})

export default i18n
