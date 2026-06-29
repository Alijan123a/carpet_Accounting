import { describe, it, expect } from 'vitest'
import { clientBalance, clientBalances, canArchiveClient } from '../balance'
import { postingAmountCents } from '../sign'
import type { LedgerTransaction } from '../types'

// Helper to build a minimal transaction row.
function tx(currency: 'AFN' | 'USD', amountCents: number): Pick<LedgerTransaction, 'currency' | 'amountCents'> {
  return { currency, amountCents }
}

describe('clientBalance', () => {
  it('sums signed amounts for a single currency', () => {
    const rows = [tx('AFN', 900000), tx('AFN', -400000)] // sale 9000, paid 4000
    expect(clientBalance(rows, 'AFN')).toBe(500000) // client owes us 5000.00
  })

  it('returns 0 for an empty ledger', () => {
    expect(clientBalance([], 'AFN')).toBe(0)
    expect(clientBalance([], 'USD')).toBe(0)
  })

  it('keeps AFN and USD strictly separate (never summed together)', () => {
    const rows = [tx('AFN', 900000), tx('USD', 32000)]
    expect(clientBalance(rows, 'AFN')).toBe(900000)
    expect(clientBalance(rows, 'USD')).toBe(32000)
    const both = clientBalances(rows)
    expect(both).toEqual({ AFN: 900000, USD: 32000 })
    // The two must never be combined into one number.
    expect(both.AFN + both.USD).not.toBe(clientBalance(rows, 'AFN'))
  })

  it('negative balance means we owe the client', () => {
    const rows = [tx('AFN', postingAmountCents({ kind: 'purchase', amountCents: 600000 }))]
    expect(clientBalance(rows, 'AFN')).toBe(-600000) // we owe 6000.00
  })

  it('a transaction plus its exact reversal nets to zero', () => {
    const sale = postingAmountCents({ kind: 'sale', amountCents: 900000 })
    const rows = [tx('AFN', sale), tx('AFN', -sale)]
    expect(clientBalance(rows, 'AFN')).toBe(0)
  })
})

describe('canArchiveClient', () => {
  it('allows archive only when both balances are zero', () => {
    expect(canArchiveClient([])).toBe(true)
    expect(canArchiveClient([tx('AFN', 100)])).toBe(false)
    expect(canArchiveClient([tx('USD', 1)])).toBe(false)
    expect(canArchiveClient([tx('AFN', 500), tx('AFN', -500)])).toBe(true)
  })
})
