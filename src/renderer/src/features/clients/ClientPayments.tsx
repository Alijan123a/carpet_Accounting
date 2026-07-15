import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Undo2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { toast } from '@renderer/components/ui/toast'
import { DateInput } from '@renderer/components/ui/date-input'
import { SortHeader, type SortState } from '@renderer/components/ui/sort-header'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/store/settings'
import { formatDate, startOfDayEpoch, endOfDayEpoch } from '@renderer/lib/date'
import { formatCents, currencySymbol } from '@shared/accounting'
import type { TransactionView } from '@shared/contracts'
import { PaymentDialog } from './PaymentDialog'

const PAGE_SIZE = 100
const ROW_HEIGHT = 48
const GRID =
  'grid grid-cols-[44px_110px_150px_150px_minmax(140px,1fr)_72px] items-center gap-0 px-4 [&>*]:border-e [&>*]:border-border [&>*:last-child]:border-e-0 [&>*]:px-2 [&>*]:!text-center [&>*]:!justify-center'

/**
 * Payments tab of a client: every `payment` transaction with date-range /
 * search filters and sortable columns, like the statement. The sign convention
 * tells the direction: amount < 0 → the client paid us, amount > 0 → we paid
 * the client (see shared/accounting/sign.ts). Double-click opens the payment in
 * an editable dialog (saving posts a reversal + a corrected payment); reversed
 * payments are hidden here so only live ones show — the statement keeps all.
 */
export function ClientPayments({ clientId, onChanged }: { clientId: number; onChanged: () => void }): JSX.Element {
  const { t } = useTranslation()
  const calendar = useSettings((s) => s.calendar)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortState>({ by: 'transactionDate', dir: 'desc' })

  useEffect(() => {
    const h = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(h)
  }, [searchInput])

  const [rows, setRows] = useState<TransactionView[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reverseTarget, setReverseTarget] = useState<TransactionView | null>(null)
  const [editTx, setEditTx] = useState<TransactionView | null>(null)

  const rowsRef = useRef<TransactionView[]>([])
  const loadingRef = useRef(false)
  rowsRef.current = rows

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
          type: 'payment',
          excludeReversed: true,
          search,
          sortBy: sort.by,
          sortDir: sort.dir,
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
    [clientId, from, to, search, sort]
  )

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

  async function doReverse(): Promise<void> {
    if (!reverseTarget) return
    setBusy(true)
    try {
      await window.api.transactions.reverse(reverseTarget.id)
      setReverseTarget(null)
      toast.success(t('common.reversedToast', 'Transaction reversed.'))
      void fetchPage(true)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Filters (same set as the statement: date range + note search) */}
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
          <span className="block">{t('statement.search', 'Search')}</span>
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('payments.searchPlaceholder', 'Note…')}
            className="h-9 w-52"
          />
        </label>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        <div className={cn(GRID, 'h-9 shrink-0 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground')}>
          <span>{t('statement.number', '#')}</span>
          <SortHeader col="transactionDate" sort={sort} onSort={setSort}>
            {t('statement.date', 'Date')}
          </SortHeader>
          <span>{t('payments.direction', 'Direction')}</span>
          <SortHeader col="amountCents" sort={sort} onSort={setSort}>
            {t('statement.amount', 'Amount')}
          </SortHeader>
          <span>{t('statement.description', 'Description')}</span>
          <span />
        </div>
        <div ref={parentRef} onScroll={onScroll} className="flex-1 overflow-auto">
          {rows.length === 0 && !loading && (
            <div className="p-8 text-center text-sm text-muted-foreground">{t('payments.empty', 'No payments.')}</div>
          )}
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const tx = rows[vi.index]
              // Sign convention: payment from client → negative, to client → positive.
              const received = tx.amountCents < 0
              return (
                <div
                  key={tx.id}
                  onDoubleClick={() => setEditTx(tx)}
                  title={t('payments.editHint', 'Double-click to edit')}
                  className={cn(
                    GRID,
                    'absolute start-0 top-0 w-full cursor-pointer border-b border-border text-sm hover:bg-accent/50'
                  )}
                  style={{ height: `${ROW_HEIGHT}px`, transform: `translateY(${vi.start}px)` }}
                >
                  <span className="text-muted-foreground">{vi.index + 1}</span>
                  <span className="text-muted-foreground">{formatDate(tx.transactionDate, calendar)}</span>
                  <span className={cn('text-xs font-medium', received ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                    {received
                      ? t('payments.received', 'Received from client')
                      : t('payments.paid', 'Paid to client')}
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatCents(Math.abs(tx.amountCents))}
                    <span className="ms-1 text-xs text-muted-foreground">{currencySymbol(tx.currency)}</span>
                  </span>
                  <span className="truncate text-muted-foreground">{tx.note || t('common.none', '—')}</span>
                  <span className="flex justify-end">
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
                  </span>
                </div>
              )
            })}
          </div>
          {loading && <div className="p-3 text-center text-xs text-muted-foreground">{t('common.loading', 'Loading…')}</div>}
        </div>
      </div>

      <PaymentDialog
        open={editTx !== null}
        onOpenChange={(o) => !o && setEditTx(null)}
        clientId={clientId}
        editTx={editTx}
        onSaved={() => {
          void fetchPage(true)
          onChanged()
        }}
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
    </>
  )
}
