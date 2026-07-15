import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Pencil, Archive, ArchiveRestore, Wallet, Trash2, ClipboardList } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { toast } from '@renderer/components/ui/toast'
import { cn } from '@renderer/lib/utils'
import type { ClientListItem } from '@shared/contracts'
import { BalanceAmount } from './BalanceAmount'
import { ClientFormDialog } from './ClientFormDialog'
import { PaymentDialog } from './PaymentDialog'
import { BuyerBills } from './BuyerBills'
import { ClientPayments } from './ClientPayments'
import { SellerCarpets } from './SellerCarpets'
import { ClientMaterialLines } from './ClientMaterialLines'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { DeleteConfirmDialog } from '@renderer/components/DeleteConfirmDialog'
import { SellerOrders } from '@renderer/features/orders/SellerOrders'
import type { ClientScreenKind } from './ClientsModule'

type TabKey = 'bills' | 'carpets' | 'tar' | 'payments'

/** Tabs per screen: buyers = بل‌ها/پرداخت‌ها; sellers = قالین‌ها/تار/پرداخت‌ها; tar sellers = حساب تار/پرداخت‌ها. */
const TABS_BY_KIND: Record<ClientScreenKind, TabKey[]> = {
  buyer: ['bills', 'payments'],
  seller: ['carpets', 'tar', 'payments'],
  tar_seller: ['tar', 'payments']
}

export function ClientDetail({
  clientId,
  kind,
  onBack,
  onChanged
}: {
  clientId: number
  /** Which module opened this detail — decides the tab set shown. */
  kind: ClientScreenKind
  onBack: () => void
  onChanged: () => void
}): JSX.Element {
  const { t } = useTranslation()

  const [client, setClient] = useState<ClientListItem | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showOrders, setShowOrders] = useState(false)

  const tabs = TABS_BY_KIND[kind]
  const [view, setView] = useState<TabKey>(tabs[0])
  // Bump to remount the active tab after a mutation (payment added, reversal…)
  // so its own data reloads.
  const [refreshKey, setRefreshKey] = useState(0)

  const loadClient = useCallback(async (): Promise<void> => {
    const c = await window.api.clients.get(clientId)
    setClient(c)
  }, [clientId])

  useEffect(() => {
    void loadClient()
  }, [loadClient])

  function refreshAll(): void {
    void loadClient()
    setRefreshKey((k) => k + 1)
    onChanged()
  }

  // For mutations a tab already handles internally (it refetches itself):
  // refresh the balances/list without remounting the tab (keeps its filters).
  function onTabChanged(): void {
    void loadClient()
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
        toast.success(t('common.archivedToast', 'Archived.'))
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
      toast.success(t('common.restoredToast', 'Restored.'))
      refreshAll()
    } finally {
      setBusy(false)
    }
  }

  async function doDelete(): Promise<void> {
    setBusy(true)
    setDeleteError(null)
    try {
      const res = await window.api.clients.remove(clientId)
      if (!res.ok) {
        setDeleteError(
          t('clients.deleteHasRecords', 'This client has transactions or records and cannot be deleted. Archive instead.')
        )
        return
      }
      setDeleteOpen(false)
      toast.success(t('common.deleted', 'Deleted.'))
      onChanged()
      onBack()
    } finally {
      setBusy(false)
    }
  }

  const balances = client?.balances ?? { AFN: 0, USD: 0 }
  const canArchive = balances.AFN === 0 && balances.USD === 0
  const isSeller = client?.kind === 'seller' || client?.kind === 'both'

  const tabLabel = (tab: TabKey): string => {
    switch (tab) {
      case 'bills':
        return t('bills.title', 'Bills')
      case 'carpets':
        return t('carpets.title', 'Carpets')
      case 'tar':
        return t('tar.tabTitle', 'Tar account')
      default:
        return t('payments.title', 'Payments')
    }
  }

  if (showOrders && client) {
    return <SellerOrders clientId={clientId} clientName={client.name} onBack={() => setShowOrders(false)} />
  }

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
          {isSeller && (
            <Button variant="outline" size="sm" onClick={() => setShowOrders(true)}>
              <ClipboardList className="h-4 w-4" />
              {t('orders.title', 'Orders')}
            </Button>
          )}
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
              title={
                !canArchive
                  ? t('clients.archiveDisabledReason', 'A client can only be archived when both balances are zero.')
                  : undefined
              }
            >
              <Archive className="h-4 w-4" />
              {t('clients.archive', 'Archive')}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              setDeleteError(null)
              setDeleteOpen(true)
            }}
          >
            <Trash2 className="h-4 w-4" />
            {t('common.delete', 'Delete')}
          </Button>
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
      {actionError && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {actionError}
        </p>
      )}

      {/* Tabs — set depends on which screen opened this client. */}
      <div className="mb-3 inline-flex w-fit rounded-lg border border-border bg-muted/40 p-0.5 text-sm">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setView(tab)}
            className={cn(
              'rounded-md px-3 py-1 font-medium transition-colors',
              view === tab ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tabLabel(tab)}
          </button>
        ))}
      </div>

      {view === 'bills' ? (
        <BuyerBills key={`bills-${refreshKey}`} clientId={clientId} />
      ) : view === 'carpets' ? (
        <SellerCarpets key={`carpets-${refreshKey}`} clientId={clientId} />
      ) : view === 'tar' ? (
        <ClientMaterialLines key={`tar-${refreshKey}`} clientId={clientId} />
      ) : (
        <ClientPayments key={`payments-${refreshKey}`} clientId={clientId} onChanged={onTabChanged} />
      )}

      <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} client={client} onSaved={refreshAll} />
      <PaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} clientId={clientId} onSaved={refreshAll} />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={t('clients.archiveConfirmTitle', 'Archive this client?')}
        body={t('clients.archiveConfirmBody', 'The client will be hidden from the default list.')}
        confirmLabel={t('clients.archive', 'Archive')}
        busy={busy}
        onConfirm={doArchive}
      />
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('clients.deleteConfirmTitle', 'Delete this client?')}
        body={t('clients.deleteConfirmBody', 'Only clients without any transactions or records can be deleted. This cannot be undone from the client screen.')}
        expectedText={client?.name ?? ''}
        busy={busy}
        error={deleteError}
        onConfirm={doDelete}
      />
    </div>
  )
}
