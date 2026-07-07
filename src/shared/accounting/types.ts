/**
 * Shared accounting types.
 *
 * These types are used by both the pure accounting engine (this folder) and the
 * Electron main-process DB layer. They contain NO runtime dependencies so they
 * are safe to import from anywhere (renderer, main, tests).
 *
 * All monetary values are INTEGER CENTS (see CLAUDE.md §3). Field names that
 * carry money end in `Cents` to make this impossible to forget.
 */

export type Currency = 'AFN' | 'USD'

/**
 * Every currency the data model understands. They are NEVER mixed or summed.
 * (Kept as the full set so historical AFN data still computes correctly.)
 */
export const CURRENCIES: readonly Currency[] = ['AFN', 'USD'] as const

/**
 * Currencies the UI exposes for entry and display. Every currency picker,
 * balance column, dashboard tile, and report section is driven off this list.
 * AFN and USD are both enabled; they are always shown/totalled SEPARATELY.
 */
export const ENABLED_CURRENCIES: readonly Currency[] = CURRENCIES

/** Currency pre-selected for new entries. */
export const DEFAULT_CURRENCY: Currency = 'USD'

export type TransactionType =
  | 'purchase' // we buy from a client (we owe them)
  | 'sale' // we sell to a client (they owe us)
  | 'payment' // money changes hands, reducing an open balance
  | 'reversal' // cancels a previous transaction (never edit/delete the original)
  | 'adjustment' // manual signed correction

/**
 * A ledger transaction. `amountCents` is ALREADY SIGNED per the sign convention
 * in {@link ./sign}. A client's balance for a currency is simply the sum of the
 * signed `amountCents` of their transactions in that currency.
 */
export interface LedgerTransaction {
  id?: number
  clientId: number
  type: TransactionType
  currency: Currency
  /** Signed integer cents (see sign convention). */
  amountCents: number
  carpetId?: number | null
  materialLineId?: number | null
  /** Sell invoice this transaction was posted from (its «بل» number shows in statements). */
  invoiceId?: number | null
  /** Business date (user-settable), epoch milliseconds. */
  transactionDate: number
  /** Precise creation timestamp, epoch milliseconds. */
  createdAt?: number
  /** Set on reversal rows: the id of the transaction being reversed. */
  reversesTransactionId?: number | null
  note?: string | null
}

/** A value broken out per currency. AFN and USD are always kept separate. */
export interface PerCurrency<T = number> {
  AFN: T
  USD: T
}
