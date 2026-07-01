import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyRound, ShieldAlert } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import type { LicenseStatus } from '@shared/contracts'

/**
 * License activation gate. Shown before the password lock when the app is not
 * activated on THIS device.
 *
 *  - reason 'device_mismatch': this key is bound to a different machine. We DO
 *    NOT offer a key field here (that would let a copied license.json re-home
 *    itself); the user must contact support to transfer the license.
 *  - otherwise: show the key entry form.
 */
export function ActivationScreen({
  reason,
  onActivated
}: {
  reason?: LicenseStatus['reason']
  onActivated: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const blocked = reason === 'device_mismatch'

  async function submit(): Promise<void> {
    setError(null)
    if (key.trim().length === 0) {
      setError(t('license.empty', 'Please enter your license key.'))
      return
    }
    setBusy(true)
    try {
      const res = await window.api.license.activate(key)
      if (!res.ok) {
        if (res.reason === 'device_mismatch') {
          setError(
            t(
              'license.deviceMismatch',
              'This key is already activated on a different device. Please contact support to transfer your license.'
            )
          )
        } else {
          setError(t('license.invalid', 'Invalid license key. Please check it and try again.'))
        }
        return
      }
      onActivated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-bg flex h-screen w-screen items-center justify-center p-6 text-foreground">
      <div className="w-full max-w-sm rounded-2xl border border-border/70 bg-card p-7 shadow-card-hover">
        <div className="mb-5 flex flex-col items-center gap-3 text-center">
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-glow ${
              blocked ? 'bg-destructive' : 'bg-brand-gradient'
            }`}
          >
            {blocked ? <ShieldAlert className="h-6 w-6" /> : <KeyRound className="h-6 w-6" />}
          </span>
          <div>
            <div className="text-lg font-bold tracking-tight">{t('app.name', 'Carpet Accounting')}</div>
            <div className="text-xs text-muted-foreground">
              {blocked
                ? t('license.blockedTitle', 'Invalid device')
                : t('license.activateTitle', 'Activate your license')}
            </div>
          </div>
        </div>

        {blocked ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">
              {t(
                'license.deviceMismatch',
                'This key is already activated on a different device. Please contact support to transfer your license.'
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(
                'license.blockedHint',
                'Your license is locked to the computer where it was first activated. If you changed or replaced this machine, contact support to move it.'
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="mb-1 text-xs text-muted-foreground">
              {t(
                'license.activateHint',
                'Enter your license key to activate this app. The license will be locked to this computer.'
              )}
            </p>
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={t('license.keyPlaceholder', 'XXXXX-XXXXX-XXXXX-XXXXX-XXXX')}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button variant="brand" className="w-full" onClick={submit} disabled={busy}>
              {t('license.activate', 'Activate')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
