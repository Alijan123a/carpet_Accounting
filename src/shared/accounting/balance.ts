import type { Currency, LedgerTransaction, PerCurrency } from './types'

/** Minimal shape needed to compute a balance. */
type BalanceRow = Pick<LedgerTransaction, 'currency' | 'amountCents'>

/**
 * A client's balance for a single currency, computed by summing the signed
 * amountCents of their transactions in that currency (CLAUDE.md §3 rule 5 — a
 * balance is NEVER stored, always derived).
 *
 * positive => client owes us; negative => we owe the client.
 */
export function clientBalance(transactions: readonly BalanceRow[], currency: Currency): number {
  let sum = 0
  for (const t of transactions) {
    if (t.currency === currency) sum += t.amountCents
  }
  return sum
}

/**
 * Both balances for a client, kept strictly separate. AFN and USD are never
 * added together.
 */
export function clientBalances(transactions: readonly BalanceRow[]): PerCurrency {
  return {
    AFN: clientBalance(transactions, 'AFN'),
    USD: clientBalance(transactions, 'USD')
  }
}

/**
 * A client may be archived only when BOTH currency balances are zero
 * (CLAUDE.md §4). This is the canonical check used by the archive feature.
 */
export function canArchiveClient(transactions: readonly BalanceRow[]): boolean {
  const b = clientBalances(transactions)
  return b.AFN === 0 && b.USD === 0
}
