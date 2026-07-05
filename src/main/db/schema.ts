/**
 * Drizzle ORM schema — Phase 1 accounting core.
 *
 * Conventions (CLAUDE.md §3/§4):
 *  - All money columns are INTEGER CENTS and named `*_cents`.
 *  - Timestamps are INTEGER epoch milliseconds.
 *  - Physical measures (carpet length/width/area in meters/m², material kg) are
 *    REAL — they are NOT money.
 *  - `transactions` is an append-only immutable ledger (see migrate.ts triggers).
 *  - Indexes are added on every column used for filtering / sorting / joining.
 *
 * NOTE: the runtime table DDL lives in migrate.ts (executed at startup). This
 * file is the type-safe query surface; keep the two in sync.
 */
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'
import type { Currency, TransactionType } from '../../shared/accounting/types'

export const clients = sqliteTable(
  'clients',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    phone: text('phone'),
    notes: text('notes'),
    /**
     * Role of this account: someone we sell to ('buyer'), someone we buy from
     * ('seller'), or both. A single unified account is kept regardless (CLAUDE.md
     * §4) — `kind` only drives which list screen a client shows up on.
     */
    kind: text('kind').$type<'buyer' | 'seller' | 'both'>().notNull().default('both'),
    createdAt: integer('created_at').notNull(),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    archivedAt: integer('archived_at')
  },
  (t) => ({
    nameIdx: index('idx_clients_name').on(t.name),
    kindIdx: index('idx_clients_kind').on(t.kind),
    archivedIdx: index('idx_clients_archived').on(t.archived)
  })
)

export const carpetStatuses = sqliteTable('carpet_statuses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  labelFa: text('label_fa').notNull(),
  labelEn: text('label_en').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false)
})

export const materials = sqliteTable(
  'materials',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    currency: text('currency').$type<Currency>().notNull(),
    createdAt: integer('created_at').notNull(),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    archivedAt: integer('archived_at')
  },
  (t) => ({
    currencyIdx: index('idx_materials_currency').on(t.currency),
    archivedIdx: index('idx_materials_archived').on(t.archived)
  })
)

export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id),
    type: text('type').$type<TransactionType>().notNull(),
    currency: text('currency').$type<Currency>().notNull(),
    /** SIGNED integer cents (see shared/accounting/sign.ts). */
    amountCents: integer('amount_cents').notNull(),
    carpetId: integer('carpet_id').references((): any => carpets.id),
    materialLineId: integer('material_line_id').references((): any => materialLines.id),
    transactionDate: integer('transaction_date').notNull(),
    createdAt: integer('created_at').notNull(),
    reversesTransactionId: integer('reverses_transaction_id'),
    note: text('note')
  },
  (t) => ({
    clientIdx: index('idx_tx_client').on(t.clientId),
    clientCurrencyIdx: index('idx_tx_client_currency').on(t.clientId, t.currency),
    typeIdx: index('idx_tx_type').on(t.type),
    currencyIdx: index('idx_tx_currency').on(t.currency),
    txDateIdx: index('idx_tx_date').on(t.transactionDate),
    createdAtIdx: index('idx_tx_created').on(t.createdAt),
    carpetIdx: index('idx_tx_carpet').on(t.carpetId),
    materialLineIdx: index('idx_tx_material_line').on(t.materialLineId),
    reversesIdx: index('idx_tx_reverses').on(t.reversesTransactionId)
  })
)

export const carpets = sqliteTable(
  'carpets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    labelNumber: text('label_number').notNull().unique(),
    length: real('length').notNull(),
    width: real('width').notNull(),
    area: real('area').notNull(),
    sortGrade: text('sort_grade'),
    // Buy (acquisition) side.
    pricePerMeterCents: integer('price_per_meter_cents').notNull(),
    sortDeductionCents: integer('sort_deduction_cents').notNull().default(0),
    currency: text('currency').$type<Currency>().notNull(),
    totalPriceCents: integer('total_price_cents').notNull(),
    status: text('status').notNull().default('in_warehouse'),
    boughtFromClientId: integer('bought_from_client_id').references(() => clients.id),
    buyTransactionId: integer('buy_transaction_id').references((): any => transactions.id),
    // Sell side (nullable until the carpet is sold). Sold whole to ONE client.
    sellPricePerMeterCents: integer('sell_price_per_meter_cents'),
    sellSortDeductionCents: integer('sell_sort_deduction_cents'),
    sellTotalPriceCents: integer('sell_total_price_cents'),
    soldToClientId: integer('sold_to_client_id').references(() => clients.id),
    sellTransactionId: integer('sell_transaction_id').references((): any => transactions.id),
    soldAt: integer('sold_at'),
    createdAt: integer('created_at').notNull(),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    archivedAt: integer('archived_at')
  },
  (t) => ({
    statusIdx: index('idx_carpets_status').on(t.status),
    currencyIdx: index('idx_carpets_currency').on(t.currency),
    boughtFromIdx: index('idx_carpets_bought_from').on(t.boughtFromClientId),
    soldToIdx: index('idx_carpets_sold_to').on(t.soldToClientId),
    archivedIdx: index('idx_carpets_archived').on(t.archived),
    createdAtIdx: index('idx_carpets_created').on(t.createdAt)
  })
)

export const materialLines = sqliteTable(
  'material_lines',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    materialId: integer('material_id')
      .notNull()
      .references(() => materials.id),
    direction: text('direction').$type<'buy' | 'sell'>().notNull(),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id),
    /** Weight in kilograms (REAL; decimals allowed). */
    kilograms: real('kilograms').notNull(),
    pricePerKgCents: integer('price_per_kg_cents').notNull(),
    totalCents: integer('total_cents').notNull(),
    currency: text('currency').$type<Currency>().notNull(),
    transactionId: integer('transaction_id').references((): any => transactions.id),
    transactionDate: integer('transaction_date').notNull(),
    createdAt: integer('created_at').notNull()
  },
  (t) => ({
    materialIdx: index('idx_ml_material').on(t.materialId),
    clientIdx: index('idx_ml_client').on(t.clientId),
    directionIdx: index('idx_ml_direction').on(t.direction),
    currencyIdx: index('idx_ml_currency').on(t.currency),
    txDateIdx: index('idx_ml_date').on(t.transactionDate)
  })
)

export const expenses = sqliteTable(
  'expenses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    category: text('category').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').$type<Currency>().notNull(),
    expenseDate: integer('expense_date').notNull(),
    note: text('note'),
    createdAt: integer('created_at').notNull()
  },
  (t) => ({
    categoryIdx: index('idx_expenses_category').on(t.category),
    currencyIdx: index('idx_expenses_currency').on(t.currency),
    dateIdx: index('idx_expenses_date').on(t.expenseDate)
  })
)

export type ClientRow = typeof clients.$inferSelect
export type CarpetRow = typeof carpets.$inferSelect
export type MaterialRow = typeof materials.$inferSelect
export type MaterialLineRow = typeof materialLines.$inferSelect
export type TransactionRow = typeof transactions.$inferSelect
export type ExpenseRow = typeof expenses.$inferSelect
