import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArchiveRestore } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { toast } from '@renderer/components/ui/toast'
import { formatCents, currencySymbol } from '@shared/accounting'
import type { ArchiveLists } from '@shared/contracts'

const kg = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 3 })

export function ArchivePage(): JSX.Element {
  const { t } = useTranslation()
  const [data, setData] = useState<ArchiveLists | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setData(await window.api.archive.list())
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function restore(kind: 'client' | 'carpet' | 'material', id: number): Promise<void> {
    setBusy(true)
    try {
      if (kind === 'client') await window.api.clients.restore(id)
      else if (kind === 'carpet') await window.api.carpets.restore(id)
      else await window.api.materials.restore(id)
      toast.success(t('common.restoredToast', 'Restored.'))
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <div className="p-6 text-sm text-muted-foreground">{t('common.loading', 'Loading…')}</div>

  const empty = data.clients.length === 0 && data.carpets.length === 0 && data.materials.length === 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('nav.archive', 'Archive')}</h2>
        <p className="text-xs text-muted-foreground">{t('archive.subtitle', 'Archived items are hidden from active views but never deleted, and still appear in date-ranged reports.')}</p>
      </div>

      {empty && <p className="text-sm text-muted-foreground">{t('archive.empty', 'Nothing is archived.')}</p>}

      {data.clients.length > 0 && (
        <Section title={t('archive.clients', 'Clients')}>
          {data.clients.map((c) => (
            <Row key={c.id} label={c.name} onRestore={() => restore('client', c.id)} busy={busy} t={t} />
          ))}
        </Section>
      )}

      {data.carpets.length > 0 && (
        <Section title={t('archive.carpets', 'Carpets')}>
          {data.carpets.map((c) => (
            <Row
              key={c.id}
              label={c.label}
              meta={`${formatCents(c.totalPriceCents)} ${currencySymbol(c.currency)}`}
              onRestore={() => restore('carpet', c.id)}
              busy={busy}
              t={t}
            />
          ))}
        </Section>
      )}

      {data.materials.length > 0 && (
        <Section title={t('archive.materials', 'Material lots')}>
          {data.materials.map((m) => (
            <Row
              key={m.id}
              label={m.name}
              meta={`${kg(m.stockKg)} kg · ${currencySymbol(m.currency)}`}
              onRestore={() => restore('material', m.id)}
              busy={busy}
              t={t}
            />
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">{children}</div>
    </section>
  )
}

function Row({
  label,
  meta,
  onRestore,
  busy,
  t
}: {
  label: string
  meta?: string
  onRestore: () => void
  busy: boolean
  t: (k: string, d: string) => string
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 last:border-b-0">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
      </div>
      <Button variant="outline" size="sm" onClick={onRestore} disabled={busy}>
        <ArchiveRestore className="h-4 w-4" />
        {t('common.restore', 'Restore')}
      </Button>
    </div>
  )
}
