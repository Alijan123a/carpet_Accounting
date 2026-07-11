import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyRound, ShieldAlert, Copy, Check } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import type { LicenseStatus } from '@shared/contracts'

/**
 * License activation gate. Shown before the password lock when the app is not
 * activated on THIS device.
 *
 * License keys are bound to the machine fingerprint (see licenseManager), so we
 * always show the fingerprint here: the user copies it, sends it to support, and
 * receives a key issued specifically for this device. A key made for any other
 * machine will not validate, so it is safe to always offer the key field —
 * including in the device_mismatch case (e.g. after a hardware change), where
 * the old saved key no longer matches and a fresh device-specific key is needed.
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
  const [fingerprint, setFingerprint] = useState('')
  const [copied, setCopied] = useState(false)

  const mismatch = reason === 'device_mismatch'

  useEffect(() => {
    window.api.license.fingerprint().then(setFingerprint).catch(() => undefined)
  }, [])

  async function copyFingerprint(): Promise<void> {
    if (!fingerprint) return
    try {
      await navigator.clipboard.writeText(fingerprint)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable — the value is selectable as a fallback */
    }
  }

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
        setError(
          t('license.invalid', 'This license key is not valid for this device. Please check it and try again.')
        )
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
              mismatch ? 'bg-destructive' : 'bg-brand-gradient'
            }`}
          >
            {mismatch ? <ShieldAlert className="h-6 w-6" /> : <KeyRound className="h-6 w-6" />}
          </span>
          <div>
            <div className="text-lg font-bold tracking-tight">{t('app.name', 'Carpet Accounting')}</div>
            <div className="text-xs text-muted-foreground">
              {mismatch ? t('license.blockedTitle', 'Invalid device') : t('license.activateTitle', 'Activate your license')}
            </div>
          </div>
        </div>

        {mismatch && (
          <p className="mb-3 text-sm text-destructive">
            {t(
              'license.deviceMismatch',
              'Your saved license is for a different device. Send the fingerprint below to support to get a key for this computer.'
            )}
          </p>
        )}

        {/* Device fingerprint — copy this to request a key. */}
        <div className="mb-3 space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">
            {t('license.fingerprintLabel', 'Your device fingerprint')}
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 select-all break-all rounded-lg border border-input bg-muted/40 px-3 py-2 font-mono text-[11px] leading-snug">
              {fingerprint || '…'}
            </code>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={copyFingerprint}
              disabled={!fingerprint}
              title={t('license.copy', 'Copy')}
              aria-label={t('license.copy', 'Copy')}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t(
              'license.activateHint',
              'Enter the license key issued for this device. The license is locked to this computer.'
            )}
          </p>
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={t('license.keyPlaceholder', 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX')}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button variant="brand" className="w-full" onClick={submit} busy={busy}>
            {t('license.activate', 'Activate')}
          </Button>
        </div>
      </div>
    </div>
  )
}
