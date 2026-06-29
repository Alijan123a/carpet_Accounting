import type { TransactionType } from './types'

/**
 * ============================================================================
 *  THE SIGN CONVENTION  (defined ONCE here — never deviate). [CLAUDE.md §3]
 * ============================================================================
 *
 * For a client account, per currency, the stored `amountCents` is SIGNED:
 *
 *      amountCents > 0   =>   the CLIENT OWES US      (receivable / they are debtor)
 *      amountCents < 0   =>   WE OWE THE CLIENT        (payable    / we are debtor)
 *
 * A client's balance for a currency is therefore simply:
 *
 *      balance = SUM(amountCents) for that client and that currency
 *
 * (positive balance => they owe us; negative => we owe them). AFN and USD are
 * summed SEPARATELY and never mixed.
 *
 * How each business event maps to a signed amount:
 *
 *   sale              we sell to client    -> they owe us more   -> ( + )
 *   purchase          we buy from client   -> we owe them more   -> ( - )
 *   payment (from client, they pay us)     -> receivable down    -> ( - )
 *   payment (to client, we pay them)       -> payable down       -> ( + )
 *   reversal          opposite of original -> negate the original amount
 *   adjustment        manual               -> caller supplies the signed amount
 *
 * Always create transactions through {@link postingAmountCents} so the sign is
 * applied in exactly one place.
 */

export type PostingIntent =
  | { kind: 'sale'; amountCents: number } // magnitude
  | { kind: 'purchase'; amountCents: number } // magnitude
  | { kind: 'paymentFromClient'; amountCents: number } // client pays us; magnitude
  | { kind: 'paymentToClient'; amountCents: number } // we pay client; magnitude
  | { kind: 'adjustment'; signedAmountCents: number } // already signed

/**
 * Convert a business intent into the SIGNED amountCents to store in the ledger.
 * Magnitudes are taken as absolute values so a caller can never accidentally
 * flip a sign by passing a negative number.
 */
export function postingAmountCents(intent: PostingIntent): number {
  switch (intent.kind) {
    case 'sale':
      return Math.abs(intent.amountCents)
    case 'purchase':
      return -Math.abs(intent.amountCents)
    case 'paymentFromClient':
      return -Math.abs(intent.amountCents)
    case 'paymentToClient':
      return Math.abs(intent.amountCents)
    case 'adjustment':
      return intent.signedAmountCents
  }
}

/** The ledger transaction `type` that corresponds to a posting intent. */
export function transactionTypeForIntent(intent: PostingIntent): TransactionType {
  switch (intent.kind) {
    case 'sale':
      return 'sale'
    case 'purchase':
      return 'purchase'
    case 'paymentFromClient':
    case 'paymentToClient':
      return 'payment'
    case 'adjustment':
      return 'adjustment'
  }
}
