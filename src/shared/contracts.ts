/**
 * IPC contracts shared between the Electron main process (producer) and the
 * renderer (consumer). Pure types only — no runtime dependencies.
 */
import type { Currency, PerCurrency, TransactionType } from './accounting'

// --- Clients ----------------------------------------------------------------

export interface ClientProfileInput {
  name: string
  phone?: string | null
  notes?: string | null
}

export interface ClientListItem {
  id: number
  name: string
  phone: string | null
  notes: string | null
  archived: boolean
  archivedAt: number | null
  createdAt: number
  /** Per-currency balance (positive = client owes us; negative = we owe them). */
  balances: PerCurrency
}

export interface ClientsListParams {
  search?: string
  includeArchived?: boolean
  limit: number
  offset: number
}

export interface ClientsListResult {
  rows: ClientListItem[]
  total: number
}

// --- Transactions (statement view) ------------------------------------------

export type TypeFilter = TransactionType | 'all'

export interface TransactionView {
  id: number
  clientId: number
  type: TransactionType
  currency: Currency
  amountCents: number
  transactionDate: number
  createdAt: number
  note: string | null
  carpetId: number | null
  carpetLabel: string | null
  materialLineId: number | null
  materialName: string | null
  reversesTransactionId: number | null
}

export interface ClientTransactionsParams {
  clientId: number
  fromDate?: number | null
  toDate?: number | null
  type?: TypeFilter
  limit: number
  offset: number
}

export interface ClientTransactionsResult {
  rows: TransactionView[]
  total: number
}

/** The API surface exposed on `window.api` (see preload). */
export interface ClientsApi {
  list: (params: ClientsListParams) => Promise<ClientsListResult>
  get: (id: number) => Promise<ClientListItem | null>
  create: (input: ClientProfileInput) => Promise<number>
  update: (id: number, input: ClientProfileInput) => Promise<void>
  archive: (id: number) => Promise<{ ok: boolean; reason?: string }>
  restore: (id: number) => Promise<void>
  transactions: (params: ClientTransactionsParams) => Promise<ClientTransactionsResult>
}

export interface TransactionsApi {
  reverse: (id: number) => Promise<number>
}
