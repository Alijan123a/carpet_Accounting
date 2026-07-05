import { describe, it, expect } from 'vitest'
import {
  invoiceLineTotalCents,
  invoiceLineAreaFromDims,
  invoiceGrandTotalCents
} from '../invoice'

describe('invoiceLineAreaFromDims', () => {
  it('area = length × width', () => {
    expect(invoiceLineAreaFromDims(2.5, 3)).toBe(7.5)
    expect(invoiceLineAreaFromDims(0, 3)).toBe(0)
  })
})

describe('invoiceLineTotalCents', () => {
  it('line total defaults to area × unit price (cents)', () => {
    // 1000.00/m × 6 m² = 6000.00 -> 600000 cents
    expect(invoiceLineTotalCents(6, 100000)).toBe(600000)
  })

  it('rounds a fractional product straight back to whole cents', () => {
    // 33.33/m × 3.3 m² = 109.989 -> 109.99 -> 10999 cents
    expect(invoiceLineTotalCents(3.3, 3333)).toBe(10999)
    // 100.00/m × 2.345 m² = 234.50 -> 23450 cents
    expect(invoiceLineTotalCents(2.345, 10000)).toBe(23450)
  })

  it('edge case: zero area or zero price gives zero', () => {
    expect(invoiceLineTotalCents(0, 100000)).toBe(0)
    expect(invoiceLineTotalCents(6, 0)).toBe(0)
  })
})

describe('invoiceGrandTotalCents', () => {
  it('sums the (possibly overridden) line totals', () => {
    expect(invoiceGrandTotalCents([600000, 10999, 23450])).toBe(634449)
  })

  it('honours a manually overridden line total (does not recompute)', () => {
    // A sticky/manual total of 5000 cents is summed verbatim, even if it does not
    // equal area × unit price for that line.
    expect(invoiceGrandTotalCents([600000, 5000])).toBe(605000)
  })

  it('edge case: empty invoice totals to zero', () => {
    expect(invoiceGrandTotalCents([])).toBe(0)
  })
})
