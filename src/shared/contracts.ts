/**
 * IPC contracts shared between the Electron main process (producer) and the
 * renderer (consumer). Pure types only — no runtime dependencies.
 */
import type { Currency, PerCurrency, TransactionType, PeriodProfitResult } from './accounting'
import type { ReportId, ReportParams, ReportResult } from './reports'

// --- Sorting ------------------------------------------------------------------

export type SortDir = 'asc' | 'desc'

/**
 * Column-sort request for list queries. `sortBy` values are whitelisted in each
 * main-process handler (never interpolated into SQL); unknown keys fall back to
 * the list's default order.
 */
export interface SortParams {
  sortBy?: string
  sortDir?: SortDir
}

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

export interface ClientsListParams extends SortParams {
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
  /** Sell invoice this sale was posted from («بل فروش» number). */
  invoiceId: number | null
  invoiceNumber: string | null
  reversesTransactionId: number | null
}

export interface ClientTransactionsParams extends SortParams {
  clientId: number
  fromDate?: number | null
  toDate?: number | null
  type?: TypeFilter
  /** Matches note, linked carpet label, or linked material name. */
  search?: string
  /** Hide transactions that were later reversed (used by the payments tab). */
  excludeReversed?: boolean
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
  /** Hard delete; refused ('has_records') once the client has any history. */
  remove: (id: number) => Promise<{ ok: boolean; reason?: string }>
  transactions: (params: ClientTransactionsParams) => Promise<ClientTransactionsResult>
  addPayment: (input: PaymentInput) => Promise<number>
  /**
   * "Edit" a posted payment: atomically posts a reversal of the original plus a
   * corrected payment (the ledger is immutable — nothing is ever updated).
   * Returns the corrected payment's transaction id.
   */
  updatePayment: (transactionId: number, input: PaymentInput) => Promise<number>
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
   * «متراژ» m². Defaults to length×width, but the user may override it (some
   * carpets are not a clean L×W rectangle). When 0/unset the server derives it.
   */
  area?: number
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
  /** Provenance of these carpets; defaults to 'bought' when unset. */
  origin?: 'ordered' | 'bought'
  lines: CarpetBatchLineInput[]
}

export interface CarpetsBatchResult {
  ok: boolean
  /** Number of carpets created. */
  created?: number
  /** Ids of the created carpets (for audit logging). */
  ids?: number[]
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
  /** Purchase date when a buy transaction exists, else when it was entered. */
  dateEpoch: number
  /** Where it came from: 'ordered' (made for a سفارش) or 'bought' (stock). */
  origin: 'ordered' | 'bought'
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

export interface CarpetsListParams extends SortParams {
  search?: string
  status?: string | 'all'
  sortGrade?: string | 'all'
  /** Filter by provenance: 'ordered' (made for a سفارش) / 'bought' (stock). */
  origin?: 'ordered' | 'bought' | 'all'
  includeArchived?: boolean
  limit: number
  offset: number
}

export interface CarpetsListResult {
  rows: CarpetListItem[]
  total: number
  /** Aggregates over the WHOLE filtered set (not just the loaded page). */
  totalSqm: number
  /** Sum of total prices per currency (AFN/USD are never mixed), in cents. */
  totalPriceAfnCents: number
  totalPriceUsdCents: number
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
  /** Hard delete; refused ('has_transactions') once ledger-linked. */
  remove: (id: number) => Promise<{ ok: boolean; reason?: string }>
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
  /**
   * Explicit sale total in cents (an invoice line whose «متراژ»/«جمله» was
   * manually overridden). When set, this IS the posted/stored sale amount
   * instead of (price/m − deduction) × stored area.
   */
  sellTotalCentsOverride?: number | null
}

// --- Sell invoice («بل فروش») -----------------------------------------------

export interface SellInvoiceLineInput {
  /** Real in-warehouse carpet to sell (null = free-text, print-only line). */
  carpetId: number | null
  /** «نوع جنس» — goods type, defaults to Carpet. */
  goodsType: string
  /** «تفصیل» — free-text line description (printed and used in the sale note). */
  description?: string | null
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

// --- Buyer bills (grouped sell invoices) ------------------------------------

/** One row of a buyer's bills table: a whole sell invoice collapsed to totals. */
export interface BuyerBillSummary {
  id: number
  number: string
  transactionDate: number
  createdAt: number
  currency: Currency
  /** «جمله» — printed grand total in integer cents. */
  totalCents: number
  /** «مجموع متراژ» — sum of the line areas (m²). */
  totalSqm: number
  /** Number of goods lines on the bill (تعداد قالین). */
  carpetCount: number
}

/** One snapshot line of a stored invoice (parsed from invoices.lines_json). */
export interface InvoiceLineView {
  goodsType: string
  description: string | null
  labelNumber: string
  length: number
  width: number
  area: number
  unitPriceCents: number
  totalCents: number
}

/** Full detail of a single stored bill — used for the detail popup + export. */
export interface InvoiceDetailView {
  id: number
  number: string
  buyerClientId: number
  buyerName: string
  buyerPhone: string | null
  currency: Currency
  totalCents: number
  totalSqm: number
  transactionDate: number
  createdAt: number
  lines: InvoiceLineView[]
}

export interface InvoicesApi {
  /** Every sell invoice for one buyer, newest first (grouped bills view). */
  listForBuyer: (clientId: number) => Promise<BuyerBillSummary[]>
  /** Full detail of one bill, or null if it no longer exists. */
  get: (id: number) => Promise<InvoiceDetailView | null>
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

export interface MaterialsListParams extends SortParams {
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
  /** Rename only — the lot currency is locked once chosen. */
  update: (id: number, input: MaterialInput) => Promise<void>
  addLine: (input: MaterialLineInput) => Promise<number>
  /** Posts a reversal for the line's transaction, then soft-deletes the line. */
  removeLine: (lineId: number) => Promise<{ ok: boolean; reason?: string }>
  archive: (id: number) => Promise<void>
  restore: (id: number) => Promise<void>
  /** Hard delete; refused ('has_lines') once the lot has any lines. */
  remove: (id: number) => Promise<{ ok: boolean; reason?: string }>
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

export interface ExpensesListParams extends SortParams {
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

/** A user-managed expense category. */
export interface ExpenseType {
  id: number
  name: string
}

export interface ExpenseTypeInput {
  name: string
}

export interface ExpenseTypesApi {
  list: () => Promise<ExpenseType[]>
  create: (input: ExpenseTypeInput) => Promise<{ ok: boolean; reason?: string }>
  rename: (id: number, input: ExpenseTypeInput) => Promise<{ ok: boolean; reason?: string }>
  /** Refused ('in_use') when any expense still uses the type's name. */
  remove: (id: number) => Promise<{ ok: boolean; reason?: string }>
}

// --- Orders («سفارشات») -----------------------------------------------------

/** Order lifecycle states (fixed set; labels are localized in the UI). */
export type OrderStatus = 'pending' | 'on_work' | 'finished' | 'delivered' | 'cancelled'

export const ORDER_STATUSES: OrderStatus[] = ['pending', 'on_work', 'finished', 'delivered', 'cancelled']

/**
 * Per-carpet production state. Unassigned pieces are «در انتظار» (pending); once
 * handed to a بافنده an assignment moves «در حال کار», then «تکمیل» when made and
 * «تحویل‌شده» once delivered. Status is always changed manually.
 */
export type OrderItemStatus = 'pending' | 'on_work' | 'complete' | 'delivered'

export const ORDER_ITEM_STATUSES: OrderItemStatus[] = ['pending', 'on_work', 'complete', 'delivered']

/**
 * A partial hand-off of a carpet item to one بافنده (weaver). A single item's
 * quantity can be split across several assignments (e.g. 5 + 5 + 10), each with
 * its own date and a manually-set status.
 */
export interface OrderAssignment {
  /** Stable local id (generated in the renderer). */
  id: string
  sellerClientId: number
  /** Snapshot of the بافنده's name at assignment time (for display). */
  sellerName: string
  /** How many pieces of the item were handed to this بافنده. */
  quantity: number
  /** Business date the pieces were given (epoch ms). */
  assignedDate: number
  /** Manually-set production state of this hand-off. */
  status: OrderItemStatus
}

/**
 * One row of a multi-item order (snapshotted as JSON in orders.items_json).
 * Free-text specs of the commissioned carpet; SQM defaults to width×length in
 * the form but the stored value is whatever the user confirmed.
 *
 * `assignments` is optional for backward compatibility with orders saved before
 * per-carpet hand-offs existed; the main process normalizes it on read.
 */
export interface OrderItem {
  /** «نوع قالین» — carpet type, free text. */
  carpetType: string
  /** «گراف» — design/graph reference, free text. */
  graph: string
  width: number | null
  length: number | null
  /** «متراژ» — square meters. */
  sqm: number | null
  /** «رنگ متن» — field (ground) colour, free text. */
  textColor: string
  /** «رنگ حاشیه» — border colour, free text. */
  borderColor: string
  quantity: number
  /** «تفصیل» — free text. */
  description: string
  /** Partial hand-offs of this item to بافنده‌ها (defaults to []). */
  assignments?: OrderAssignment[]
}

/** One carpet hand-off, flattened with its parent order — for the بافنده page. */
export interface SellerAssignmentView {
  orderId: number
  orderNo: string | null
  buyerName: string | null
  orderDate: number
  /** Index of the item inside the order (for stable keys). */
  itemIndex: number
  assignmentId: string
  carpetType: string
  graph: string
  width: number | null
  length: number | null
  sqm: number | null
  quantity: number
  assignedDate: number
  status: OrderItemStatus
}

export interface OrderInput {
  buyerClientId: number
  /** «نمبر سفارش» — user-editable order number. */
  orderNo?: string | null
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
  /** Multi-item body of the order (invoice-style rows). */
  items?: OrderItem[] | null
}

export interface OrderView {
  id: number
  buyerClientId: number
  buyerName: string | null
  orderNo: string | null
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
  /** Parsed items_json ([] for legacy single-line orders). */
  items: OrderItem[]
}

export interface OrdersListParams extends SortParams {
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
  get: (id: number) => Promise<OrderView | null>
  create: (input: OrderInput) => Promise<number>
  update: (id: number, input: OrderInput) => Promise<void>
  /** Quick status change from the list (sets delivered_at when → delivered). */
  setStatus: (id: number, status: OrderStatus) => Promise<void>
  /** Replace the per-item snapshot (per-carpet بافنده assignments / status). */
  updateItems: (id: number, items: OrderItem[]) => Promise<void>
  /** Carpets handed to a given بافنده (flattened across all orders). */
  assignedToSeller: (sellerClientId: number) => Promise<SellerAssignmentView[]>
  remove: (id: number) => Promise<void>
  /** Suggested next «نمبر سفارش» (sequential over the orders table). */
  nextOrderNo: () => Promise<string>
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

/** One client's signed per-currency balance (dashboard detail popups). */
export interface ClientBalanceRow {
  id: number
  name: string
  AFN: number
  USD: number
}

/** One sold carpet inside the net-profit breakdown. */
export interface ProfitDetailCarpet {
  id: number
  label: string
  date: number
  buyerName: string | null
  currency: Currency
  buyTotalCents: number
  sellTotalCents: number
  profitCents: number
}

/** One material sell line inside the net-profit breakdown. */
export interface ProfitDetailMaterial {
  id: number
  name: string
  date: number
  buyerName: string | null
  currency: Currency
  kilograms: number
  profitCents: number
}

/** One expense subtracted from the period profit. */
export interface ProfitDetailExpense {
  id: number
  category: string
  date: number
  currency: Currency
  amountCents: number
}

export interface DashboardProfitDetail {
  carpets: ProfitDetailCarpet[]
  materials: ProfitDetailMaterial[]
  expenses: ProfitDetailExpense[]
}

/** One in-warehouse carpet (dashboard warehouse popup). */
export interface WarehouseCarpetRow {
  id: number
  label: string
  area: number
  sortGrade: string | null
  currency: Currency
  totalPriceCents: number
}

/** One material lot with its stock on hand (dashboard stock popup). */
export interface MaterialStockRow {
  id: number
  name: string
  currency: Currency
  stockKg: number
}

export interface DashboardStockDetail {
  carpets: WarehouseCarpetRow[]
  materials: MaterialStockRow[]
}

export interface DashboardApi {
  summary: (params: { fromDate: number; toDate: number }) => Promise<DashboardSummary>
  balancesByClient: () => Promise<ClientBalanceRow[]>
  profitDetail: (params: { fromDate: number; toDate: number }) => Promise<DashboardProfitDetail>
  stockDetail: () => Promise<DashboardStockDetail>
}

// --- Reports + PDF (Phase 5) ------------------------------------------------

export interface ReportsApi {
  run: (id: ReportId, params: ReportParams) => Promise<ReportResult>
}

export interface PdfApi {
  /** Persist PDF bytes via a native Save dialog. */
  save: (fileName: string, bytes: Uint8Array) => Promise<{ ok: boolean; path?: string; canceled?: boolean }>
  /**
   * Print a PDF via the Windows shell "Print" verb. `opened: true` means the
   * verb was unavailable and the file was opened in the viewer instead.
   */
  print: (fileName: string, bytes: Uint8Array) => Promise<{ ok: boolean; opened?: boolean }>
}

export interface FilesApi {
  /** Persist arbitrary bytes via a native Save dialog with a custom filter (e.g. Excel). */
  save: (
    fileName: string,
    bytes: Uint8Array,
    filterName: string,
    extensions: string[]
  ) => Promise<{ ok: boolean; path?: string; canceled?: boolean }>
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

// --- System changes (audit log + undo) ---------------------------------------

export type ChangeEntity =
  | 'client'
  | 'carpet'
  | 'material'
  | 'material_line'
  | 'expense'
  | 'order'
  | 'carpet_status'
  | 'transaction'
  | 'invoice'

export type ChangeAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'archive'
  | 'restore'
  | 'sell'
  | 'payment'
  | 'reverse'
  | 'undo'

export interface SystemChangeView {
  id: number
  entity: ChangeEntity
  entityId: number | null
  action: ChangeAction
  summary: string
  createdAt: number
  undoneAt: number | null
  /** Set when this row itself records an undo of another change. */
  undoOfChangeId: number | null
}

export interface SystemChangesListParams extends SortParams {
  search?: string
  entity?: ChangeEntity | 'all'
  limit: number
  offset: number
}

export interface SystemChangesListResult {
  rows: SystemChangeView[]
  total: number
}

export type UndoFailReason =
  | 'not_found'
  | 'already_undone'
  | 'is_undo'
  | 'not_latest'
  | 'has_records'
  | 'in_use'
  | 'not_undoable'

export interface SystemApi {
  list: (params: SystemChangesListParams) => Promise<SystemChangesListResult>
  undo: (changeId: number) => Promise<{ ok: boolean; reason?: UndoFailReason }>
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
  /**
   * DANGER: erase the entire database and start fresh. The password is
   * re-verified in the main process; a validated safety backup is written to
   * the backup folder first (its path is returned in `backup`).
   */
  resetDb: (password: string) => Promise<{ ok: boolean; reason?: string; backup?: string }>
}
