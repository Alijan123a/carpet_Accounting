import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { useSettings } from '@renderer/store/settings'

export function LanguageToggle(): JSX.Element {
  const { t } = useTranslation()
  const language = useSettings((s) => s.language)
  const setLanguage = useSettings((s) => s.setLanguage)

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-2"
      onClick={() => setLanguage(language === 'fa' ? 'en' : 'fa')}
      title={t('topbar.toggleLanguage', 'Switch language')}
      aria-label={t('topbar.toggleLanguage', 'Switch language')}
    >
      <Languages />
      <span className="font-medium">{language === 'fa' ? 'دری' : 'EN'}</span>
    </Button>
  )
}
