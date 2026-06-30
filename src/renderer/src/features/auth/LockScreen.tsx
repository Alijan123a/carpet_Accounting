import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'

/**
 * First-run password setup OR unlock on launch. The plaintext never leaves this
 * component except over IPC to the main process, which stores only a scrypt hash.
 */
export function LockScreen({
  mode,
  onUnlocked
}: {
  mode: 'setup' | 'unlock'
  onUnlocked: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(): Promise<void> {
    setError(null)
    if (password.length < 4) {
      setError(t('auth.tooShort', 'Password must be at least 4 characters.'))
      return
    }
    if (mode === 'setup' && password !== confirm) {
      setError(t('auth.mismatch', 'Passwords do not match.'))
      return
    }
    setBusy(true)
    try {
      if (mode === 'setup') {
        const res = await window.api.auth.setup(password)
        if (!res.ok) {
          setError(res.reason ?? 'error')
          return
        }
      } else {
        const res = await window.api.auth.verify(password)
        if (!res.ok) {
          setError(t('auth.wrong', 'Incorrect password.'))
          setPassword('')
          return
        }
      }
      onUnlocked()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-bg flex h-screen w-screen items-center justify-center p-6 text-foreground">
      <div className="w-full max-w-sm rounded-2xl border border-border/70 bg-card p-7 shadow-card-hover">
        <div className="mb-5 flex flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow">
            <Lock className="h-6 w-6" />
          </span>
          <div>
            <div className="text-lg font-bold tracking-tight">{t('app.name', 'Qaleen Trader')}</div>
            <div className="text-xs text-muted-foreground">
              {mode === 'setup' ? t('auth.setupTitle', 'Set a password') : t('auth.unlockTitle', 'Enter password')}
            </div>
          </div>
        </div>

        {mode === 'setup' && (
          <p className="mb-3 text-xs text-muted-foreground">
            {t('auth.setupHint', 'This password protects your accounting data. There is no recovery, so keep it safe.')}
          </p>
        )}

        <div className="space-y-3">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.password', 'Password')}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && mode === 'unlock' && submit()}
          />
          {mode === 'setup' && (
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t('auth.confirm', 'Confirm password')}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button variant="brand" className="w-full" onClick={submit} disabled={busy}>
            {mode === 'setup' ? t('auth.set', 'Set password') : t('auth.unlock', 'Unlock')}
          </Button>
        </div>
      </div>
    </div>
  )
}
