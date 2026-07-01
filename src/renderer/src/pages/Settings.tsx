import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { useSettings, type Theme, type Calendar } from '@renderer/store/settings'
import type { Language } from '@renderer/i18n'
import type { Currency } from '@shared/accounting'
import type { AppConfig, BackupFrequency } from '@shared/contracts'
import { StatusesDialog } from '@renderer/features/carpets/StatusesDialog'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { formatDateTime } from '@renderer/lib/date'

function Field({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6 rounded-2xl border border-border/70 bg-card p-4 shadow-card">
      <div>
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }): JSX.Element {
  return <h3 className="pt-2 text-sm font-semibold text-muted-foreground">{children}</h3>
}

export function Settings(): JSX.Element {
  const { t } = useTranslation()
  const { theme, language, calendar, defaultCurrency, setTheme, setLanguage, setCalendar, setDefaultCurrency } =
    useSettings()
  const [version, setVersion] = useState('0.1.0')
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [statusesOpen, setStatusesOpen] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // change-password fields
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwMsg, setPwMsg] = useState<string | null>(null)

  // device fingerprint (for support / license transfer)
  const [fingerprint, setFingerprint] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    window.api.getVersion().then(setVersion).catch(() => undefined)
    window.api.config.get().then(setConfig).catch(() => undefined)
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

  async function patchConfig(patch: Partial<AppConfig>): Promise<void> {
    setConfig(await window.api.config.set(patch))
  }

  const themes: { value: Theme; label: string }[] = [
    { value: 'light', label: t('settings.light', 'Light') },
    { value: 'dark', label: t('settings.dark', 'Dark') }
  ]
  const languages: { value: Language; label: string }[] = [
    { value: 'fa', label: 'دری / فارسی' },
    { value: 'en', label: 'English' }
  ]
  const calendars: { value: Calendar; label: string }[] = [
    { value: 'shamsi', label: t('settings.shamsi', 'Hijri Shamsi') },
    { value: 'gregorian', label: t('settings.gregorian', 'Gregorian') }
  ]

  async function backupNow(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      const res = await window.api.backup.now()
      if (res.canceled) return
      setMsg(res.ok ? t('settings.backupDone', 'Backup saved.') : `${t('settings.backupFailed', 'Backup failed')}: ${res.reason ?? ''}`)
    } finally {
      setBusy(false)
    }
  }

  async function chooseFolder(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      const res = await window.api.backup.chooseFolder()
      if (res.ok) setConfig(await window.api.config.get())
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function doRestore(): Promise<void> {
    setBusy(true)
    try {
      const res = await window.api.backup.restore()
      setRestoreOpen(false)
      if (res.canceled) return
      if (res.ok) {
        // Reload so every view reflects the restored database.
        window.location.reload()
      } else {
        setMsg(`${t('settings.backupFailed', 'Restore failed')}: ${res.reason ?? ''}`)
      }
    } catch (e) {
      setRestoreOpen(false)
      setMsg(`${t('settings.backupFailed', 'Restore failed')}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  async function changePassword(): Promise<void> {
    setPwMsg(null)
    if (newPw.length < 4) return setPwMsg(t('auth.tooShort', 'Password must be at least 4 characters.'))
    if (newPw !== confirmPw) return setPwMsg(t('auth.mismatch', 'Passwords do not match.'))
    setBusy(true)
    try {
      const res = await window.api.auth.change(curPw, newPw)
      if (res.ok) {
        setPwMsg(t('settings.passwordChanged', 'Password changed.'))
        setCurPw('')
        setNewPw('')
        setConfirmPw('')
      } else {
        setPwMsg(res.reason === 'wrong_old' ? t('settings.wrongCurrent', 'Current password is incorrect.') : (res.reason ?? 'error'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('settings.title', 'Settings')}</h2>
        <p className="text-sm text-muted-foreground">{t('settings.subtitle', 'Preferences are saved automatically.')}</p>
      </div>

      {/* Appearance */}
      <SectionTitle>{t('settings.appearance', 'Appearance')}</SectionTitle>
      <Field title={t('settings.theme', 'Theme')} description={t('settings.themeDesc', 'Switch between light and dark mode.')}>
        {themes.map((opt) => (
          <Button key={opt.value} variant={theme === opt.value ? 'default' : 'outline'} size="sm" onClick={() => setTheme(opt.value)}>
            {opt.label}
          </Button>
        ))}
      </Field>
      <Field title={t('settings.language', 'Language')} description={t('settings.languageDesc', 'Language and text direction (RTL/LTR).')}>
        {languages.map((opt) => (
          <Button key={opt.value} variant={language === opt.value ? 'default' : 'outline'} size="sm" onClick={() => setLanguage(opt.value)}>
            {opt.label}
          </Button>
        ))}
      </Field>
      <Field title={t('settings.calendar', 'Calendar')} description={t('settings.calendarDesc', 'Calendar used to display dates.')}>
        {calendars.map((opt) => (
          <Button key={opt.value} variant={calendar === opt.value ? 'default' : 'outline'} size="sm" onClick={() => setCalendar(opt.value)}>
            {opt.label}
          </Button>
        ))}
      </Field>
      <Field title={t('settings.defaultCurrency', 'Default currency')} description={t('settings.defaultCurrencyDesc', 'Pre-selected currency for new entries.')}>
        {(['AFN', 'USD'] as Currency[]).map((cur) => (
          <Button key={cur} variant={defaultCurrency === cur ? 'default' : 'outline'} size="sm" onClick={() => setDefaultCurrency(cur)}>
            {cur}
          </Button>
        ))}
      </Field>

      {/* Backup */}
      <SectionTitle>{t('settings.backup', 'Backup')}</SectionTitle>
      {config && (
        <>
          <Field title={t('settings.backupFolder', 'Backup folder')} description={config.backupFolder}>
            <Button variant="outline" size="sm" onClick={chooseFolder}>
              {t('settings.chooseFolder', 'Choose…')}
            </Button>
          </Field>
          <Field title={t('settings.backupFrequency', 'Automatic backup')} description={t('settings.backupFrequencyDesc', 'When automatic backups run.')}>
            <select
              value={config.backupFrequency}
              onChange={(e) => patchConfig({ backupFrequency: e.target.value as BackupFrequency })}
              className="h-9 rounded-lg border border-input bg-card shadow-soft px-2 text-sm"
            >
              <option value="off">{t('settings.freqOff', 'Off')}</option>
              <option value="onClose">{t('settings.freqOnClose', 'On app close')}</option>
              <option value="daily">{t('settings.freqDaily', 'Daily')}</option>
            </select>
          </Field>
          <Field title={t('settings.retention', 'Backups to keep')} description={t('settings.retentionDesc', 'Older automatic backups are deleted.')}>
            <Input
              type="number"
              min={1}
              value={config.backupRetention}
              onChange={(e) => patchConfig({ backupRetention: Math.max(1, Number(e.target.value) || 1) })}
              className="h-9 w-24"
            />
          </Field>
          <Field
            title={t('settings.backupActions', 'Manual backup')}
            description={config.lastAutoBackup ? `${t('settings.lastBackup', 'Last auto backup')}: ${formatDateTime(config.lastAutoBackup, calendar)}` : undefined}
          >
            <Button size="sm" onClick={backupNow} disabled={busy}>
              {t('settings.backupNow', 'Backup now')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRestoreOpen(true)} disabled={busy}>
              {t('settings.restore', 'Restore…')}
            </Button>
          </Field>
          {msg && <p className="px-1 text-sm text-muted-foreground">{msg}</p>}
        </>
      )}

      {/* Security */}
      <SectionTitle>{t('settings.security', 'Security')}</SectionTitle>
      <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4 shadow-card">
        <div className="text-sm font-medium">{t('settings.changePassword', 'Change password')}</div>
        <Input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} placeholder={t('settings.currentPassword', 'Current password')} />
        <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder={t('settings.newPassword', 'New password')} />
        <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder={t('settings.confirmPassword', 'Confirm new password')} />
        {pwMsg && <p className="text-sm text-muted-foreground">{pwMsg}</p>}
        <Button size="sm" onClick={changePassword} disabled={busy}>
          {t('settings.changePassword', 'Change password')}
        </Button>
      </div>

      {/* License */}
      <SectionTitle>{t('settings.license', 'License')}</SectionTitle>
      <div className="space-y-2 rounded-2xl border border-border/70 bg-card p-4 shadow-card">
        <div className="text-sm font-medium">{t('settings.deviceFingerprint', 'Device fingerprint')}</div>
        <div className="text-xs text-muted-foreground">
          {t(
            'settings.deviceFingerprintDesc',
            'A unique ID of this computer. Share it with support if you need to transfer your license to another device.'
          )}
        </div>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 select-all break-all rounded-lg border border-input bg-muted/40 px-3 py-2 font-mono text-xs">
            {fingerprint || '…'}
          </code>
          <Button variant="outline" size="sm" onClick={copyFingerprint} disabled={!fingerprint}>
            {copied ? t('settings.copied', 'Copied') : t('settings.copy', 'Copy')}
          </Button>
        </div>
      </div>

      {/* Carpet statuses */}
      <SectionTitle>{t('settings.statuses', 'Carpet statuses')}</SectionTitle>
      <Field title={t('statusMgr.title', 'Carpet statuses')} description={t('settings.statusesDesc', 'Add or rename the statuses used by carpets.')}>
        <Button variant="outline" size="sm" onClick={() => setStatusesOpen(true)}>
          {t('common.manage', 'Manage')}
        </Button>
      </Field>

      <div className="px-1 text-xs text-muted-foreground">
        {t('settings.version', 'Version')}: {version}
      </div>

      <StatusesDialog open={statusesOpen} onOpenChange={setStatusesOpen} onChanged={() => undefined} />
      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title={t('settings.restoreWarnTitle', 'Restore from backup?')}
        body={t('settings.restoreWarnBody', 'This REPLACES your current database with the selected backup. Current data not in the backup will be lost. Make a backup first if unsure.')}
        confirmLabel={t('settings.restore', 'Restore')}
        destructive
        busy={busy}
        onConfirm={doRestore}
      />
    </div>
  )
}
