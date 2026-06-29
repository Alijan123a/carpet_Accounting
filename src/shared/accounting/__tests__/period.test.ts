import { describe, it, expect } from 'vitest'
import { periodProfit, type ProfitEntry, type ExpenseEntry } from '../period'

const JAN = Date.UTC(2026, 0, 15)
const FEB = Date.UTC(2026, 1, 15)
const MAR = Date.UTC(2026, 2, 15)

const carpetProfits: ProfitEntry[] = [
  { currency: 'AFN', profitCents: 300000, date: JAN },
  { currency: 'AFN', profitCents: 100000, date: MAR }, // outside Jan–Feb window
  { currency: 'USD', profitCents: 12000, date: FEB }
]
const materialProfits: ProfitEntry[] = [
  { currency: 'AFN', profitCents: 12000, date: FEB },
  { currency: 'USD', profitCents: 5000, date: JAN }
]
const expenses: ExpenseEntry[] = [
  { currency: 'AFN', amountCents: 30000, date: JAN },
  { currency: 'USD', amountCents: 2000, date: FEB }
]

describe('periodProfit', () => {
  it('net = (carpet + material) gross − expenses, per currency', () => {
    const afn = periodProfit({
      carpetProfits,
      materialProfits,
      expenses,
      fromDate: JAN,
      toDate: FEB,
      currency: 'AFN'
    })
    expect(afn.grossProfitCents).toBe(312000) // 300000 + 12000 (MAR carpet excluded)
    expect(afn.expensesCents).toBe(30000)
    expect(afn.netProfitCents).toBe(282000) // 2820.00 AFN
  })

  it('computes USD completely separately from AFN', () => {
    const usd = periodProfit({
      carpetProfits,
      materialProfits,
      expenses,
      fromDate: JAN,
      toDate: FEB,
      currency: 'USD'
    })
    expect(usd.grossProfitCents).toBe(17000) // 12000 + 5000
    expect(usd.expensesCents).toBe(2000)
    expect(usd.netProfitCents).toBe(15000) // 150.00 USD
  })

  it('excludes entries outside the date range (inclusive bounds)', () => {
    const afnNarrow = periodProfit({
      carpetProfits,
      materialProfits,
      expenses,
      fromDate: MAR,
      toDate: MAR,
      currency: 'AFN'
    })
    expect(afnNarrow.grossProfitCents).toBe(100000) // only the MAR carpet profit
    expect(afnNarrow.expensesCents).toBe(0)
    expect(afnNarrow.netProfitCents).toBe(100000)
  })

  it('edge case: empty inputs -> all zero', () => {
    const r = periodProfit({
      carpetProfits: [],
      materialProfits: [],
      expenses: [],
      fromDate: JAN,
      toDate: MAR,
      currency: 'AFN'
    })
    expect(r).toMatchObject({ grossProfitCents: 0, expensesCents: 0, netProfitCents: 0 })
  })
})
