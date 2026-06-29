import { describe, it, expect } from 'vitest'
import {
  effectivePricePerMeterCents,
  carpetTotalPriceCents,
  carpetProfitCents,
  carpetSellTotalCents,
  type CarpetValuation
} from '../carpet'

describe('carpetTotalPriceCents', () => {
  it('computes (price/m − deduction) × area', () => {
    // 1000.00/m, no deduction, 6 m² => 6000.00
    expect(carpetTotalPriceCents(100000, 0, 6)).toBe(600000)
  })

  it('applies a fixed sort deduction to the price per meter', () => {
    // (1000.00 − 50.00) × 6 = 5700.00
    expect(carpetTotalPriceCents(100000, 5000, 6)).toBe(570000)
  })

  it('rounds a fractional area product to the nearest whole cent', () => {
    // 100.00/m × 2.345 m² = 234.50 -> 23450 cents
    expect(carpetTotalPriceCents(10000, 0, 2.345)).toBe(23450)
    // 33.33/m × 3.3 = 109.989 -> rounds to 109.99 -> 10999 cents
    expect(carpetTotalPriceCents(3333, 0, 3.3)).toBe(10999)
  })

  it('edge case: zero area or zero price gives zero', () => {
    expect(carpetTotalPriceCents(100000, 0, 0)).toBe(0)
    expect(carpetTotalPriceCents(0, 0, 6)).toBe(0)
  })

  it('edge case: deduction larger than price clamps to 0 (no negative total)', () => {
    expect(effectivePricePerMeterCents(5000, 8000)).toBe(0)
    expect(carpetTotalPriceCents(5000, 8000, 6)).toBe(0)
  })
})

describe('carpetProfitCents', () => {
  const sold: CarpetValuation = {
    area: 6,
    currency: 'AFN',
    buyPricePerMeterCents: 100000, // 1000.00/m buy
    buyDeductionCents: 0,
    sellPricePerMeterCents: 150000, // 1500.00/m sell
    sellDeductionCents: 0
  }

  it('profit = sell total − buy total', () => {
    // sell 9000.00 − buy 6000.00 = 3000.00
    expect(carpetProfitCents(sold)).toBe(300000)
  })

  it('returns null while the carpet is unsold', () => {
    const unsold: CarpetValuation = {
      area: 6,
      currency: 'AFN',
      buyPricePerMeterCents: 100000,
      buyDeductionCents: 0
    }
    expect(carpetSellTotalCents(unsold)).toBeNull()
    expect(carpetProfitCents(unsold)).toBeNull()
  })

  it('respects deductions on both buy and sell sides', () => {
    const c: CarpetValuation = {
      area: 10,
      currency: 'USD',
      buyPricePerMeterCents: 5000, // 50.00/m, −5.00 ded => 45.00/m => 450.00 buy
      buyDeductionCents: 500,
      sellPricePerMeterCents: 8000, // 80.00/m, −10.00 ded => 70.00/m => 700.00 sell
      sellDeductionCents: 1000
    }
    expect(carpetProfitCents(c)).toBe(25000) // 700.00 − 450.00 = 250.00
  })

  it('edge case: sell deduction larger than sell price -> sell total 0, profit is negative buy cost', () => {
    const c: CarpetValuation = {
      area: 5,
      currency: 'AFN',
      buyPricePerMeterCents: 10000,
      buyDeductionCents: 0, // buy 500.00
      sellPricePerMeterCents: 2000,
      sellDeductionCents: 9000 // clamps to 0 => sell 0
    }
    expect(carpetSellTotalCents(c)).toBe(0)
    expect(carpetProfitCents(c)).toBe(-50000) // 0 − 500.00 (a loss)
  })
})
