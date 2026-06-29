import { describe, it, expect } from 'vitest'
import { postingAmountCents, transactionTypeForIntent } from '../sign'

describe('sign convention (postingAmountCents)', () => {
  it('sale is positive (client owes us)', () => {
    expect(postingAmountCents({ kind: 'sale', amountCents: 900000 })).toBe(900000)
  })

  it('purchase is negative (we owe client)', () => {
    expect(postingAmountCents({ kind: 'purchase', amountCents: 600000 })).toBe(-600000)
  })

  it('payment from client reduces receivable (negative)', () => {
    expect(postingAmountCents({ kind: 'paymentFromClient', amountCents: 400000 })).toBe(-400000)
  })

  it('payment to client reduces payable (positive)', () => {
    expect(postingAmountCents({ kind: 'paymentToClient', amountCents: 200000 })).toBe(200000)
  })

  it('magnitudes are taken as absolute (a stray negative cannot flip the sign)', () => {
    expect(postingAmountCents({ kind: 'sale', amountCents: -900000 })).toBe(900000)
    expect(postingAmountCents({ kind: 'purchase', amountCents: -600000 })).toBe(-600000)
  })

  it('adjustment passes the signed amount through unchanged', () => {
    expect(postingAmountCents({ kind: 'adjustment', signedAmountCents: -1234 })).toBe(-1234)
    expect(postingAmountCents({ kind: 'adjustment', signedAmountCents: 5678 })).toBe(5678)
  })

  it('maps intents to the correct ledger type', () => {
    expect(transactionTypeForIntent({ kind: 'sale', amountCents: 1 })).toBe('sale')
    expect(transactionTypeForIntent({ kind: 'purchase', amountCents: 1 })).toBe('purchase')
    expect(transactionTypeForIntent({ kind: 'paymentFromClient', amountCents: 1 })).toBe('payment')
    expect(transactionTypeForIntent({ kind: 'paymentToClient', amountCents: 1 })).toBe('payment')
    expect(transactionTypeForIntent({ kind: 'adjustment', signedAmountCents: 1 })).toBe('adjustment')
  })
})
