import { useEffect } from 'react'
import { create } from 'zustand'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

/**
 * Lightweight app-wide toast system (no external dependency).
 * Usage: `toast.success(t('common.saved', 'Saved.'))` after a mutation, or
 * `toast.error(message)` for failures that happen outside a dialog.
 * Toasts stack at the bottom-start corner (logical — flips in RTL),
 * auto-dismiss after 3.5s and can be dismissed by click.
 */

export type ToastKind = 'success' | 'error'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastStore {
  toasts: ToastItem[]
  push: (kind: ToastKind, message: string) => void
  dismiss: (id: number) => void
}

let nextId = 1

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (kind, message) =>
    set((s) => ({
      // Keep at most 4 on screen; drop the oldest.
      toasts: [...s.toasts.slice(-3), { id: nextId++, kind, message }]
    })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

export const toast = {
  success: (message: string): void => useToastStore.getState().push('success', message),
  error: (message: string): void => useToastStore.getState().push('error', message)
}

const AUTO_DISMISS_MS = 3500

function ToastCard({ item }: { item: ToastItem }): JSX.Element {
  const dismiss = useToastStore((s) => s.dismiss)

  useEffect(() => {
    const h = setTimeout(() => dismiss(item.id), AUTO_DISMISS_MS)
    return () => clearTimeout(h)
  }, [item.id, dismiss])

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-3 text-sm shadow-card-hover',
        'animate-in fade-in-0 slide-in-from-bottom-2 duration-200',
        item.kind === 'success'
          ? 'border-green-600/30 bg-card text-foreground'
          : 'border-destructive/40 bg-card text-foreground'
      )}
    >
      {item.kind === 'success' ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
      ) : (
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
      )}
      <span className="max-w-xs break-words">{item.message}</span>
      <button
        onClick={() => dismiss(item.id)}
        className="ms-1 rounded-sm p-0.5 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  )
}

/** Mount once at the app root. */
export function Toaster(): JSX.Element {
  const toasts = useToastStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-4 start-4 z-[100] flex flex-col gap-2">
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  )
}
