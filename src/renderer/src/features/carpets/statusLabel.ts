import type { CarpetStatus } from '@shared/contracts'
import type { Language } from '@renderer/i18n'

/** Pick the status label for the active language. */
export function statusLabel(s: CarpetStatus, language: Language): string {
  return language === 'fa' ? s.labelFa : s.labelEn
}

/** Find a status by key and return its localized label (falls back to the key). */
export function statusLabelByKey(statuses: CarpetStatus[], key: string, language: Language): string {
  const s = statuses.find((x) => x.key === key)
  return s ? statusLabel(s, language) : key
}
