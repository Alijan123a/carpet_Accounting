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

// --- Carpets ----------------------------------------------------------------

export interface CarpetInput {
  labelNumber: string
  length: number
  width: number
  sortGrade?: string | null
  currency: Currency
  pricePerMeterCents: number
  sortDeductionCents: number
  status: string
  /** If set (create only), the matching purchase transaction is posted. */
  boughtFromClientId?: number | null
  /** Business date for the purchase transaction (epoch ms). */
  transactionDate?: number | null
}

/** Profile-only edits (financials locked once a purchase is recorded). */
export interface CarpetEditInput {
  labelNumber: string
  length: number
  width: number
  sortGrade?: string | null
  currency: Currency
  pricePerMeterCents: number
  sortDeductionCents: number
  status: string
}

export interface CarpetListItem {
  id: number
  labelNumber: string
  length: number
  width: number
  area: number
  sortGrade: string | null
  currency: Currency
  pricePerMeterCents: number
  sortDeductionCents: number
  totalPriceCents: number
  status: string
  archived: boolean
  sold: boolean
  /** Profit in cents for sold carpets; null otherwise (Phase 1 carpetProfit). */
  profitCents: number | null
}

export interface CarpetDetailView extends CarpetListItem {
  createdAt: number
  hasBuyTransaction: boolean
  boughtFromClientId: number | null
  boughtFromName: string | null
  buyTransactionId: number | null
  soldToClientId: number | null
  soldToName: string | null
  sellPricePerMeterCents: number | null
  sellSortDeductionCents: number | null
  sellTotalPriceCents: number | null
  sellTransactionId: number | null
  soldAt: number | null
}

export interface CarpetsListParams {
  search?: string
  status?: string | 'all'
  sortGrade?: string | 'all'
  includeArchived?: boolean
  limit: number
  offset: number
}

export interface CarpetsListResult {
  rows: CarpetListItem[]
  total: number
}

export interface CarpetStatus {
  id: number
  key: string
  labelFa: string
  labelEn: string
  isDefault: boolean
}

export interface CarpetStatusInput {
  labelFa: string
  labelEn: string
}

export interface CarpetsApi {
  list: (params: CarpetsListParams) => Promise<CarpetsListResult>
  get: (id: number) => Promise<CarpetDetailView | null>
  create: (input: CarpetInput) => Promise<{ ok: boolean; id?: number; reason?: string }>
  update: (id: number, input: CarpetEditInput) => Promise<{ ok: boolean; reason?: string }>
  archive: (id: number) => Promise<void>
  restore: (id: number) => Promise<void>
  sortGrades: () => Promise<string[]>
}

export interface CarpetStatusesApi {
  list: () => Promise<CarpetStatus[]>
  create: (input: CarpetStatusInput) => Promise<{ ok: boolean; reason?: string }>
  rename: (id: number, input: CarpetStatusInput) => Promise<void>
  remove: (id: number) => Promise<{ ok: boolean; reason?: string }>
}
