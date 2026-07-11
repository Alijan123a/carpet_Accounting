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

interface DeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Extra explanation shown under the title. */
  body?: string
  /**
   * The exact text the user must type to enable the delete button — typically
   * the record's name/label. Guards against accidental deletes (the user has
   * to consciously identify WHAT they are deleting).
   */
  expectedText: string
  busy?: boolean
  /** Server-side rejection message (e.g. record has ledger transactions). */
  error?: string | null
  onConfirm: () => void
}

/** Hard-delete confirmation that requires re-typing the record's name. */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  expectedText,
  busy,
  error,
  onConfirm
}: DeleteConfirmDialogProps): JSX.Element {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  const match = typed.trim() === expectedText.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="h-5 w-5 text-destructive" />
            {title}
          </DialogTitle>
          {body && <DialogDescription>{body}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="common.deleteTypeToConfirm"
              defaults="To confirm, type <b>{{name}}</b> below:"
              values={{ name: expectedText }}
              components={{ b: <span className="font-semibold text-foreground" /> }}
            />
          </p>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={expectedText}
            aria-label={expectedText}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && match && !busy) onConfirm()
            }}
          />
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
          <Button variant="destructive" onClick={onConfirm} disabled={!match} busy={busy}>
            {t('common.delete', 'Delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
