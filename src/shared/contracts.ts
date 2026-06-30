/**
 * IPC contracts shared between the Electron main process (producer) and the
 * renderer (consumer). Pure types only — no runtime dependencies.
 */
import type { Currency, PerCurrency, TransactionType, PeriodProfitResult } from './accounting'
import type { ReportId, ReportParams, ReportResult } from './reports'

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
  addPayment: (input: PaymentInput) => Promise<number>
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
  archive: (id: number) => Promise<{ ok: boolean; reason?: string }>
  restore: (id: number) => Promise<void>
  sortGrades: () => Promise<string[]>
  sell: (input: CarpetSellInput) => Promise<{ ok: boolean; reason?: string }>
}

export interface CarpetStatusesApi {
  list: () => Promise<CarpetStatus[]>
  create: (input: CarpetStatusInput) => Promise<{ ok: boolean; reason?: string }>
  rename: (id: number, input: CarpetStatusInput) => Promise<void>
  remove: (id: number) => Promise<{ ok: boolean; reason?: string }>
}

// --- Carpet sale (Phase 4) --------------------------------------------------

export interface CarpetSellInput {
  carpetId: number
  buyerClientId: number
  sellPricePerMeterCents: number
  sellSortDeductionCents: number
  transactionDate?: number | null
}

// --- Payments (Phase 4) -----------------------------------------------------

export type PaymentDirection = 'fromClient' | 'toClient'

export interface PaymentInput {
  clientId: number
  currency: Currency
  amountCents: number
  direction: PaymentDirection
  transactionDate?: number | null
  note?: string | null
}

// --- Material / Tar (Phase 4) -----------------------------------------------

export interface MaterialInput {
  name: string
  currency: Currency
}

export interface MaterialLineInput {
  materialId: number
  direction: 'buy' | 'sell'
  clientId: number
  kilograms: number
  pricePerKgCents: number
  transactionDate?: number | null
}

export interface MaterialListItem {
  id: number
  name: string
  currency: Currency
  archived: boolean
  boughtKg: number
  soldKg: number
  stockKg: number
  /** Aggregate profit in cents (weighted-average buy cost). */
  profitCents: number
}

export interface MaterialLineView {
  id: number
  direction: 'buy' | 'sell'
  clientId: number
  clientName: string | null
  kilograms: number
  pricePerKgCents: number
  totalCents: number
  currency: Currency
  transactionDate: number
  transactionId: number | null
  /** Profit for a sell line (vs weighted-avg buy cost); null for buy lines. */
  lineProfitCents: number | null
}

export interface MaterialDetailView extends MaterialListItem {
  avgBuyPerKgCents: number
  lines: MaterialLineView[]
}

export interface MaterialsListParams {
  search?: string
  includeArchived?: boolean
  limit: number
  offset: number
}

export interface MaterialsListResult {
  rows: MaterialListItem[]
  total: number
}

export interface MaterialsApi {
  list: (params: MaterialsListParams) => Promise<MaterialsListResult>
  get: (id: number) => Promise<MaterialDetailView | null>
  create: (input: MaterialInput) => Promise<number>
  addLine: (input: MaterialLineInput) => Promise<number>
  archive: (id: number) => Promise<void>
  restore: (id: number) => Promise<void>
}

// --- Expenses (Phase 5) -----------------------------------------------------

export interface ExpenseInput {
  category: string
  amountCents: number
  currency: Currency
  expenseDate: number
  note?: string | null
}

export interface ExpenseView {
  id: number
  category: string
  amountCents: number
  currency: Currency
  expenseDate: number
  note: string | null
  createdAt: number
}

export interface ExpensesListParams {
  search?: string
  category?: string | 'all'
  currency?: Currency | 'all'
  fromDate?: number | null
  toDate?: number | null
  limit: number
  offset: number
}

export interface ExpensesListResult {
  rows: ExpenseView[]
  total: number
}

export interface ExpensesApi {
  list: (params: ExpensesListParams) => Promise<ExpensesListResult>
  create: (input: ExpenseInput) => Promise<number>
  update: (id: number, input: ExpenseInput) => Promise<void>
  remove: (id: number) => Promise<void>
  categories: () => Promise<string[]>
}

// --- Dashboard (Phase 5) ----------------------------------------------------

export interface TurnoverPoint {
  period: string
  afn: number
  usd: number
}

export interface DashboardSummary {
  receivables: PerCurrency
  payables: PerCurrency
  warehouseCount: number
  materialStockKg: number
  periodProfit: { AFN: PeriodProfitResult; USD: PeriodProfitResult }
  turnover: TurnoverPoint[]
}

export interface DashboardApi {
  summary: (params: { fromDate: number; toDate: number }) => Promise<DashboardSummary>
}

// --- Reports + PDF (Phase 5) ------------------------------------------------

export interface ReportsApi {
  run: (id: ReportId, params: ReportParams) => Promise<ReportResult>
}

export interface PdfApi {
  /** Persist PDF bytes via a native Save dialog. */
  save: (fileName: string, bytes: Uint8Array) => Promise<{ ok: boolean; path?: string; canceled?: boolean }>
}

// --- Archive / Auth / Config / Backup (Phase 6) -----------------------------

export interface ArchiveLists {
  clients: { id: number; name: string }[]
  carpets: { id: number; label: string; currency: Currency; totalPriceCents: number; status: string }[]
  materials: { id: number; name: string; currency: Currency; stockKg: number }[]
}

export interface ArchiveApi {
  list: () => Promise<ArchiveLists>
}

export interface AuthStatus {
  isSet: boolean
  unlocked: boolean
}

export interface AuthApi {
  status: () => Promise<AuthStatus>
  setup: (password: string) => Promise<{ ok: boolean; reason?: string }>
  verify: (password: string) => Promise<{ ok: boolean }>
  change: (oldPassword: string, newPassword: string) => Promise<{ ok: boolean; reason?: string }>
}

export type BackupFrequency = 'off' | 'onClose' | 'daily'

export interface AppConfig {
  backupFolder: string
  backupFrequency: BackupFrequency
  backupRetention: number
  lastAutoBackup: number | null
}

export interface ConfigApi {
  get: () => Promise<AppConfig>
  set: (patch: Partial<AppConfig>) => Promise<AppConfig>
}

export interface BackupInfo {
  name: string
  path: string
  size: number
  mtime: number
}

export interface BackupApi {
  now: () => Promise<{ ok: boolean; path?: string; canceled?: boolean; reason?: string }>
  list: () => Promise<BackupInfo[]>
  chooseFolder: () => Promise<{ ok: boolean; folder?: string; canceled?: boolean }>
  restore: () => Promise<{ ok: boolean; canceled?: boolean; reason?: string; restored?: string }>
}
