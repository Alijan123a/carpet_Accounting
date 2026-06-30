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
    <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white"
            style={{ background: 'hsl(var(--laaki))' }}
          >
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <div className="text-base font-semibold">{t('app.name', 'Qaleen Trader')}</div>
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
          <Button className="w-full" onClick={submit} disabled={busy}>
            {mode === 'setup' ? t('auth.set', 'Set password') : t('auth.unlock', 'Unlock')}
          </Button>
        </div>
      </div>
    </div>
  )
}
