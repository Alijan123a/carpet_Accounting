import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowRight, Pencil, Archive, ArchiveRestore, Undo2, Wallet } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { DateInput } from '@renderer/components/ui/date-input'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/store/settings'
import { formatDate, startOfDayEpoch, endOfDayEpoch } from '@renderer/lib/date'
import type { ClientListItem, TransactionView, TypeFilter } from '@shared/contracts'
import type { TransactionType } from '@shared/accounting'
import { BalanceAmount } from './BalanceAmount'
import { ClientFormDialog } from './ClientFormDialog'
import { PaymentDialog } from './PaymentDialog'
import { TransactionDetailDialog } from './TransactionDetailDialog'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'

const PAGE_SIZE = 100
const ROW_HEIGHT = 48
const GRID = 'grid grid-cols-[110px_110px_56px_130px_minmax(120px,1fr)_minmax(100px,1fr)_72px] items-center gap-3 px-4'
const TX_TYPES: TransactionType[] = ['purchase', 'sale', 'payment', 'reversal', 'adjustment']

export function ClientDetail({
  clientId,
  onBack,
  onChanged
}: {
  clientId: number
  onBack: () => void
  onChanged: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const calendar = useSettings((s) => s.calendar)

  const [client, setClient] = useState<ClientListItem | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // statement filters
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const [rows, setRows] = useState<TransactionView[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [reverseTarget, setReverseTarget] = useState<TransactionView | null>(null)
  const [detailTx, setDetailTx] = useState<TransactionView | null>(null)

  const rowsRef = useRef<TransactionView[]>([])
  const loadingRef = useRef(false)
  rowsRef.current = rows

  const loadClient = useCallback(async (): Promise<void> => {
    const c = await window.api.clients.get(clientId)
    setClient(c)
  }, [clientId])

  const fetchPage = useCallback(
    async (reset: boolean): Promise<void> => {
      if (loadingRef.current) return
      loadingRef.current = true
      setLoading(true)
      try {
        const offset = reset ? 0 : rowsRef.current.length
        const res = await window.api.clients.transactions({
          clientId,
          fromDate: startOfDayEpoch(from),
          toDate: endOfDayEpoch(to),
          type: typeFilter,
          limit: PAGE_SIZE,
          offset
        })
        setTotal(res.total)
        setRows((prev) => (reset ? res.rows : [...prev, ...res.rows]))
      } finally {
        loadingRef.current = false
        setLoading(false)
      }
    },
    [clientId, from, to, typeFilter]
  )

  useEffect(() => {
    void loadClient()
  }, [loadClient])

  useEffect(() => {
    void fetchPage(true)
  }, [fetchPage])

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  function onScroll(): void {
    const el = parentRef.current
    if (!el || rowsRef.current.length >= total) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - ROW_HEIGHT * 4) void fetchPage(false)
  }

  function refreshAll(): void {
    void loadClient()
    void fetchPage(true)
    onChanged()
  }

  async function doArchive(): Promise<void> {
    setBusy(true)
    setActionError(null)
    try {
      const res = await window.api.clients.archive(clientId)
      if (!res.ok) {
        setActionError(t('clients.archiveDisabledReason', 'A client can only be archived when both balances are zero.'))
      } else {
        setArchiveOpen(false)
        refreshAll()
      }
    } finally {
      setBusy(false)
    }
  }

  async function doRestore(): Promise<void> {
    setBusy(true)
    try {
      await window.api.clients.restore(clientId)
      refreshAll()
    } finally {
      setBusy(false)
    }
  }

  async function doReverse(): Promise<void> {
    if (!reverseTarget) return
    setBusy(true)
    try {
      await window.api.transactions.reverse(reverseTarget.id)
      setReverseTarget(null)
      refreshAll()
    } finally {
      setBusy(false)
    }
  }

  const balances = client?.balances ?? { AFN: 0, USD: 0 }
  const canArchive = balances.AFN === 0 && balances.USD === 0

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} title={t('clients.back', 'Back to clients')}>
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight">{client?.name ?? '…'}</h2>
              {client?.archived && (
                <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {t('clients.archivedBadge', 'Archived')}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{client?.phone || t('common.none', '—')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setPaymentOpen(true)}>
            <Wallet className="h-4 w-4" />
            {t('payment.title', 'Add payment')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            {t('common.edit', 'Edit')}
          </Button>
          {client?.archived ? (
            <Button variant="outline" size="sm" onClick={doRestore} disabled={busy}>
              <ArchiveRestore className="h-4 w-4" />
              {t('clients.restore', 'Restore')}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={!canArchive || busy}
              onClick={() => setArchiveOpen(true)}
              title={!canArchive ? t('clients.archiveDisabledReason', 'Balances must be zero.') : undefined}
            >
              <Archive className="h-4 w-4" />
              {t('clients.archive', 'Archive')}
            </Button>
          )}
        </div>
      </div>

      {/* Per-currency balances — AFN and USD are never mixed or summed. */}
      <div className="mb-2 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-card">
          <div className="text-xs text-muted-foreground">{t('clients.balanceUSD', 'USD balance')}</div>
          <div className="text-lg">
            <BalanceAmount cents={balances.USD} />
          </div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-card">
          <div className="text-xs text-muted-foreground">{t('clients.balanceAFN', 'AFN balance')}</div>
          <div className="text-lg">
            <BalanceAmount cents={balances.AFN} />
          </div>
        </div>
      </div>
      {!client?.archived && !canArchive && (
        <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
          {t('clients.archiveDisabledReason', 'A client can only be archived when both balances are zero.')}
        </p>
      )}
      {actionError && <p className="mb-3 text-sm text-destructive">{actionError}</p>}

      {/* Statement filters */}
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">{t('statement.from', 'From')}</span>
          <DateInput value={from} onChange={setFrom} className="h-9 w-56" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">{t('statement.to', 'To')}</span>
          <DateInput value={to} onChange={setTo} className="h-9 w-56" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">{t('statement.typeFilter', 'Type')}</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="h-9 rounded-lg border border-input bg-card shadow-soft px-2 text-sm"
          >
            <option value="all">{t('common.all', 'All')}</option>
            {TX_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`tx.type.${ty}`, ty)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Statement table */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        <div className={cn(GRID, 'h-9 shrink-0 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground')}>
          <span>{t('statement.date', 'Date')}</span>
          <span>{t('statement.type', 'Type')}</span>
          <span>{t('statement.currency', 'Cur')}</span>
          <span className="text-end">{t('statement.amount', 'Amount')}</span>
          <span>{t('statement.linked', 'Linked')}</span>
          <span>{t('statement.note', 'Note')}</span>
          <span />
        </div>
        <div ref={parentRef} onScroll={onScroll} className="flex-1 overflow-auto">
          {rows.length === 0 && !loading && (
            <div className="p-8 text-center text-sm text-muted-foreground">{t('statement.empty', 'No transactions.')}</div>
          )}
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const tx = rows[vi.index]
              const linked = tx.carpetLabel
                ? `${t('statement.carpet', 'Carpet')} ${tx.carpetLabel}`
                : tx.materialName
                  ? `${t('statement.material', 'Material')}: ${tx.materialName}`
                  : t('common.none', '—')
              return (
                <div
                  key={tx.id}
                  onDoubleClick={() => setDetailTx(tx)}
                  title={t('txDetail.openHint', 'Double-click for full details')}
                  className={cn(
                    GRID,
                    'absolute start-0 top-0 w-full cursor-pointer border-b border-border text-sm hover:bg-accent/50'
                  )}
                  style={{ height: `${ROW_HEIGHT}px`, transform: `translateY(${vi.start}px)` }}
                >
                  <span className="text-muted-foreground">{formatDate(tx.transactionDate, calendar)}</span>
                  <span>{t(`tx.type.${tx.type}`, tx.type)}</span>
                  <span className="text-muted-foreground">{tx.currency}</span>
                  <span className="text-end">
                    <BalanceAmount cents={tx.amountCents} />
                  </span>
                  <span className="truncate text-muted-foreground">{linked}</span>
                  <span className="truncate text-muted-foreground">{tx.note || t('common.none', '—')}</span>
                  <span className="flex justify-end">
                    {tx.type !== 'reversal' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={t('statement.reverse', 'Reverse')}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onClick={() => setReverseTarget(tx)}
                      >
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
          {loading && <div className="p-3 text-center text-xs text-muted-foreground">{t('common.loading', 'Loading…')}</div>}
        </div>
      </div>

      <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} client={client} onSaved={refreshAll} />
      <PaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} clientId={clientId} onSaved={refreshAll} />
      <TransactionDetailDialog tx={detailTx} open={detailTx !== null} onOpenChange={(o) => !o && setDetailTx(null)} />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={t('clients.archiveConfirmTitle', 'Archive this client?')}
        body={t('clients.archiveConfirmBody', 'The client will be hidden from the default list.')}
        confirmLabel={t('clients.archive', 'Archive')}
        busy={busy}
        onConfirm={doArchive}
      />
      <ConfirmDialog
        open={reverseTarget !== null}
        onOpenChange={(o) => !o && setReverseTarget(null)}
        title={t('statement.reverseConfirmTitle', 'Reverse this transaction?')}
        body={t('statement.reverseConfirmBody', 'A reversing transaction will be posted; the original is never deleted.')}
        confirmLabel={t('statement.reverse', 'Reverse')}
        destructive
        busy={busy}
        onConfirm={doReverse}
      />
    </div>
  )
}
