import { useEffect, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { TriangleAlert } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { toast } from '@renderer/components/ui/toast'

/**
 * DANGER ZONE: wipe the entire database. Two deliberate hurdles guard against
 * an accidental wipe: the app password AND re-typing a confirmation word. The
 * password is re-verified in the MAIN process; a validated safety backup is
 * written to the backup folder before anything is erased.
 */
export function ResetDbDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setPassword('')
    setTyped('')
    setError(null)
  }, [open])

  // The exact word the user must type (localized — Dari users type the Dari word).
  const confirmWord = t('settings.resetConfirmWord', 'DELETE ALL')
  const canConfirm = password.length > 0 && typed.trim() === confirmWord

  async function confirm(): Promise<void> {
    if (!canConfirm || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.backup.resetDb(password)
      if (!res.ok) {
        setError(
          res.reason === 'wrong_password'
            ? t('settings.resetWrongPassword', 'Password is incorrect.')
            : (res.reason ?? t('common.error', 'An error occurred.'))
        )
        return
      }
      toast.success(t('settings.resetDone', 'All data erased. A safety backup was saved first.'))
      // Full reload so every view starts from the fresh, empty database.
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="h-5 w-5 text-destructive" />
            {t('settings.resetTitle', 'Erase ALL data?')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'settings.resetBody',
              'This permanently erases every client, carpet, material, transaction, expense, order and invoice, and starts with an empty database. A safety backup is saved to your backup folder first.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t('settings.resetPassword', 'App password')}
            </span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              <Trans
                i18nKey="settings.resetTypeWord"
                defaults="Type <b>{{word}}</b> to confirm:"
                values={{ word: confirmWord }}
                components={{ b: <span className="font-semibold text-destructive" /> }}
              />
            </span>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmWord}
              onKeyDown={(e) => e.key === 'Enter' && confirm()}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={!canConfirm} busy={busy}>
            {t('settings.resetConfirm', 'Erase everything')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
