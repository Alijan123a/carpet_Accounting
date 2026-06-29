import { describe, it, expect } from 'vitest'
import {
  materialLineTotalCents,
  weightedAverageBuyPricePerKgCents,
  materialLineProfitCents,
  aggregateMaterialProfitCents,
  type MaterialLineLike
} from '../material'

describe('materialLineTotalCents', () => {
  it('computes price/kg × kg, rounding fractional kg to cents', () => {
    expect(materialLineTotalCents(5000, 10)).toBe(50000) // 50.00/kg × 10 = 500.00
    expect(materialLineTotalCents(5000, 12.5)).toBe(62500) // × 12.5 kg = 625.00
    expect(materialLineTotalCents(333, 3.33)).toBe(1109) // 11.0889 -> 11.09
  })
})

describe('material profit', () => {
  const buyLines: MaterialLineLike[] = [
    { direction: 'buy', currency: 'AFN', kilograms: 10, pricePerKgCents: 5000 }
  ]
  const sellLines: MaterialLineLike[] = [
    { direction: 'sell', currency: 'AFN', kilograms: 4, pricePerKgCents: 8000 }
  ]

  it('single sell line profit = (sell/kg − buy/kg) × kg', () => {
    expect(materialLineProfitCents(sellLines[0], 5000)).toBe(12000) // (80−50)×4 = 120.00
  })

  it('weighted-average buy cost across multiple buy lines', () => {
    const lines: MaterialLineLike[] = [
      { direction: 'buy', currency: 'AFN', kilograms: 10, pricePerKgCents: 5000 },
      { direction: 'buy', currency: 'AFN', kilograms: 30, pricePerKgCents: 9000 }
    ]
    // (10×5000 + 30×9000) / 40 = 320000/40 = 8000
    expect(weightedAverageBuyPricePerKgCents(lines)).toBe(8000)
  })

  it('aggregate profit uses weighted-average cost basis', () => {
    expect(aggregateMaterialProfitCents(buyLines, sellLines)).toBe(12000)
  })

  it('edge case: no buys -> cost basis 0, profit equals full revenue', () => {
    expect(weightedAverageBuyPricePerKgCents([])).toBe(0)
    expect(aggregateMaterialProfitCents([], sellLines)).toBe(32000) // 80.00 × 4
  })

  it('edge case: selling at a loss yields negative profit', () => {
    const lossSell: MaterialLineLike = {
      direction: 'sell',
      currency: 'AFN',
      kilograms: 4,
      pricePerKgCents: 3000
    }
    expect(materialLineProfitCents(lossSell, 5000)).toBe(-8000) // (30−50)×4 = −80.00
  })
})
