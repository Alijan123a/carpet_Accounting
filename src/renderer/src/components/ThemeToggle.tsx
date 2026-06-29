import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { useSettings } from '@renderer/store/settings'

export function ThemeToggle(): JSX.Element {
  const { t } = useTranslation()
  const theme = useSettings((s) => s.theme)
  const toggleTheme = useSettings((s) => s.toggleTheme)

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      title={t('topbar.toggleTheme', 'Toggle theme')}
      aria-label={t('topbar.toggleTheme', 'Toggle theme')}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}
