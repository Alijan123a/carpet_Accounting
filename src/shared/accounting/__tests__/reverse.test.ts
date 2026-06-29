import { describe, it, expect } from 'vitest'
import { buildReversal } from '../reverse'
import { clientBalance } from '../balance'
import { postingAmountCents } from '../sign'
import type { LedgerTransaction } from '../types'

describe('buildReversal', () => {
  const original: LedgerTransaction & { id: number } = {
    id: 42,
    clientId: 7,
    type: 'sale',
    currency: 'AFN',
    amountCents: postingAmountCents({ kind: 'sale', amountCents: 900000 }), // +900000
    carpetId: 3,
    transactionDate: Date.UTC(2026, 0, 10),
    note: 'sold carpet #3'
  }

  it('negates the original signed amount', () => {
    const rev = buildReversal(original)
    expect(rev.amountCents).toBe(-900000)
    expect(rev.type).toBe('reversal')
    expect(rev.reversesTransactionId).toBe(42)
    expect(rev.currency).toBe('AFN')
    expect(rev.clientId).toBe(7)
    expect(rev.carpetId).toBe(3)
  })

  it('original + reversal nets the client balance to zero', () => {
    const rev = buildReversal(original)
    const balance = clientBalance(
      [
        { currency: original.currency, amountCents: original.amountCents },
        { currency: rev.currency, amountCents: rev.amountCents }
      ],
      'AFN'
    )
    expect(balance).toBe(0)
  })

  it('reverses a negative (purchase) transaction back to zero too', () => {
    const purchase: LedgerTransaction & { id: number } = {
      id: 99,
      clientId: 7,
      type: 'purchase',
      currency: 'USD',
      amountCents: postingAmountCents({ kind: 'purchase', amountCents: 20000 }), // −20000
      transactionDate: Date.UTC(2026, 0, 11)
    }
    const rev = buildReversal(purchase)
    expect(rev.amountCents).toBe(20000)
    expect(
      clientBalance(
        [
          { currency: 'USD', amountCents: purchase.amountCents },
          { currency: 'USD', amountCents: rev.amountCents }
        ],
        'USD'
      )
    ).toBe(0)
  })

  it('carries a default explanatory note and keeps the business date', () => {
    const rev = buildReversal(original)
    expect(rev.note).toBe('Reversal of transaction #42')
    expect(rev.transactionDate).toBe(original.transactionDate)
  })
})
