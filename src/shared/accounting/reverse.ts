import type { LedgerTransaction } from './types'

/**
 * Build a reversal transaction for an existing (posted) transaction.
 *
 * Transactions are IMMUTABLE (CLAUDE.md §3 rule 4): we never edit or delete a
 * posted transaction. To undo one, we POST a new `reversal` row whose signed
 * amount is the exact negation of the original. Summing the original and its
 * reversal yields zero, so the client balance returns to its prior value.
 *
 * This is a pure builder — it returns the payload to insert; the DB layer does
 * the actual INSERT.
 */
export function buildReversal(
  original: LedgerTransaction & { id: number },
  opts?: { transactionDate?: number; createdAt?: number; note?: string }
): LedgerTransaction {
  return {
    clientId: original.clientId,
    type: 'reversal',
    currency: original.currency,
    amountCents: -original.amountCents,
    carpetId: original.carpetId ?? null,
    materialLineId: original.materialLineId ?? null,
    transactionDate: opts?.transactionDate ?? original.transactionDate,
    createdAt: opts?.createdAt,
    reversesTransactionId: original.id,
    note: opts?.note ?? `Reversal of transaction #${original.id}`
  }
}
