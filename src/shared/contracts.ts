/**
 * IPC contracts shared between the Electron main process (producer) and the
 * renderer (consumer). Pure types only — no runtime dependencies.
 */
import type { Currency, PerCurrency, TransactionType, PeriodProfitResult } from './accounting'
import type { ReportId, ReportParams, ReportResult } from './reports'

// --- Clients ----------------------------------------------------------------

/** Buyer = we sell to them; Seller = we buy from them; Both = either role. */
export type ClientKind = 'buyer' | 'seller' | 'both'

export interface ClientProfileInput {
  name: string
  phone?: string | null
  notes?: string | null
  kind?: ClientKind
}

export interface ClientListItem {
  id: number
  name: string
  phone: string | null
  notes: string | null
  kind: ClientKind
  archived: boolean
  archivedAt: number | null
  createdAt: number
  /** Per-currency balance (positive = client owes us; negative = we owe them). */
  balances: PerCurrency
}

export interface ClientsListParams {
  search?: string
  includeArchived?: boolean
  /** When set, list only clients acting in this role (matches `kind` OR 'both'). */
  kind?: 'buyer' | 'seller'
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
  quality?: string | null
  currency: Currency
  pricePerMeterCents: number
  sortDeductionCents: number
  status: string
  /** If set (create only), the matching purchase transaction is posted. */
  boughtFromClientId?: number | null
  /** Business date for the purchase transaction (epoch ms). */
  transactionDate?: number | null
}

// --- Buy invoice («بل خرید» — bulk add carpets) -----------------------------

/**
 * One carpet row in a bulk purchase. The seller/currency/date are shared, and
 * new carpets are always created «در انبار» (status is not user-chosen here).
 */
export interface CarpetBatchLineInput {
  labelNumber: string
  length: number
  width: number
  sortGrade?: string | null
  quality?: string | null
  pricePerMeterCents: number
  sortDeductionCents: number
  /**
   * Final line total in integer cents. Defaults to (price − deduction) × area
   * but the user may override it directly; when 0/unset the server recomputes.
   */
  totalCents: number
}

export interface CarpetsBatchInput {
  currency: Currency
  /** If set, one purchase transaction per carpet is posted to this seller. */
  boughtFromClientId?: number | null
  /** Business date for the purchase transactions (epoch ms). */
  transactionDate?: number | null
  lines: CarpetBatchLineInput[]
}

export interface CarpetsBatchResult {
  ok: boolean
  /** Number of carpets created. */
  created?: number
  reason?: string
  /** The offending label when reason is 'label_taken' / 'duplicate_label'. */
  label?: string
}

/** Profile-only edits (financials locked once a purchase is recorded). */
export interface CarpetEditInput {
  labelNumber: string
  length: number
  width: number
  sortGrade?: string | null
  quality?: string | null
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
  quality: string | null
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
  /** Add several carpets at once (bill-style bulk purchase), posted atomically. */
  createBatch: (input: CarpetsBatchInput) => Promise<CarpetsBatchResult>
  update: (id: number, input: CarpetEditInput) => Promise<{ ok: boolean; reason?: string }>
  archive: (id: number) => Promise<{ ok: boolean; reason?: string }>
  restore: (id: number) => Promise<void>
  sortGrades: () => Promise<string[]>
  sell: (input: CarpetSellInput) => Promise<{ ok: boolean; reason?: string }>
  /** Suggested next invoice number (sequential; the user may override it). */
  nextInvoiceNumber: () => Promise<string>
  /** Save a sell invoice, posting each carpet line's sale atomically. */
  sellInvoice: (input: SellInvoiceInput) => Promise<SellInvoiceResult>
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

// --- Sell invoice («بل فروش») -----------------------------------------------

export interface SellInvoiceLineInput {
  /** Real in-warehouse carpet to sell (null = free-text, print-only line). */
  carpetId: number | null
  /** «نوع جنس» — goods type, defaults to Carpet. */
  goodsType: string
  /** «نمبر قالین» — carpet label (snapshot; free text for non-carpet lines). */
  labelNumber: string
  length: number
  width: number
  /** «متراژ» m² (defaults to length×width; may be manually overridden). */
  area: number
  /** «قیمت» unit price per meter, in integer cents. */
  unitPriceCents: number
  /** «جمله» line total, in integer cents (defaults to area×unitPrice; overridable). */
  totalCents: number
}

export interface SellInvoiceInput {
  number: string
  buyerClientId: number
  currency: Currency
  transactionDate?: number | null
  lines: SellInvoiceLineInput[]
}

export interface SellInvoiceResult {
  ok: boolean
  id?: number
  /** Final invoice number (server-assigned if the caller left it blank). */
  number?: string
  /** True when this build posts invoice sales to the ledger. */
  posted?: boolean
  reason?: string
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

// --- Orders («سفارشات») -----------------------------------------------------

/** Order lifecycle states (fixed set; labels are localized in the UI). */
export type OrderStatus = 'pending' | 'on_work' | 'finished' | 'delivered' | 'cancelled'

export const ORDER_STATUSES: OrderStatus[] = ['pending', 'on_work', 'finished', 'delivered', 'cancelled']

export interface OrderInput {
  buyerClientId: number
  title: string
  quality?: string | null
  length?: number | null
  width?: number | null
  quantity: number
  priceCents: number
  currency: Currency
  status: OrderStatus
  orderDate: number
  dueDate?: number | null
  notes?: string | null
}

export interface OrderView {
  id: number
  buyerClientId: number
  buyerName: string | null
  title: string
  quality: string | null
  length: number | null
  width: number | null
  quantity: number
  priceCents: number
  currency: Currency
  status: OrderStatus
  orderDate: number
  dueDate: number | null
  deliveredAt: number | null
  notes: string | null
  createdAt: number
  archived: boolean
}

export interface OrdersListParams {
  search?: string
  status?: OrderStatus | 'all'
  includeArchived?: boolean
  limit: number
  offset: number
}

export interface OrdersListResult {
  rows: OrderView[]
  total: number
}

export interface OrdersApi {
  list: (params: OrdersListParams) => Promise<OrdersListResult>
  create: (input: OrderInput) => Promise<number>
  update: (id: number, input: OrderInput) => Promise<void>
  /** Quick status change from the list (sets delivered_at when → delivered). */
  setStatus: (id: number, status: OrderStatus) => Promise<void>
  remove: (id: number) => Promise<void>
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

// --- License / device lock --------------------------------------------------

export interface LicenseStatus {
  activated: boolean
  /** Present when not activated: why access is blocked. */
  reason?: 'not_activated' | 'device_mismatch' | 'invalid_key'
}

export interface LicenseApi {
  status: () => Promise<LicenseStatus>
  activate: (key: string) => Promise<{ ok: boolean; reason?: LicenseStatus['reason'] }>
  /** This machine's hardware fingerprint (SHA-256 hex) — for support/license transfer. */
  fingerprint: () => Promise<string>
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
