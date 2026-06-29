import { roundCents } from './money'
import type { Currency } from './types'

/**
 * Effective price per meter = price per meter minus the (fixed) sort deduction,
 * clamped to a minimum of 0 (CLAUDE.md §4: the sort deduction is a fixed amount
 * subtracted from price-per-meter, and applies on BOTH the buy and sell side).
 *
 * Clamp rationale: a deduction larger than the price would otherwise yield a
 * negative price/m and a negative total, which is not a meaningful carpet
 * price. We treat that as an effective price of 0.
 */
export function effectivePricePerMeterCents(ppmCents: number, deductionCents: number): number {
  return Math.max(0, ppmCents - deductionCents)
}

/**
 * Total carpet price = (price/m − deduction) × area, in integer cents.
 * `area` is in square meters (m², = length × width). The single floating-point
 * multiplication is rounded straight back to whole cents.
 */
export function carpetTotalPriceCents(
  ppmCents: number,
  deductionCents: number,
  area: number
): number {
  return roundCents(effectivePricePerMeterCents(ppmCents, deductionCents) * area)
}

/**
 * A carpet valued for profit. A carpet has ONE currency for both its buy and
 * sell side (CLAUDE.md §4 — a carpet is bought and sold in a single currency).
 * Sell fields are null/undefined until the carpet is sold.
 */
export interface CarpetValuation {
  area: number
  currency: Currency
  buyPricePerMeterCents: number
  buyDeductionCents: number
  sellPricePerMeterCents?: number | null
  sellDeductionCents?: number | null
}

/** The acquisition (buy) total for a carpet, in integer cents. */
export function carpetBuyTotalCents(c: CarpetValuation): number {
  return carpetTotalPriceCents(c.buyPricePerMeterCents, c.buyDeductionCents, c.area)
}

/** The sale total for a carpet (null until sold), in integer cents. */
export function carpetSellTotalCents(c: CarpetValuation): number | null {
  if (c.sellPricePerMeterCents == null) return null
  return carpetTotalPriceCents(c.sellPricePerMeterCents, c.sellDeductionCents ?? 0, c.area)
}

/**
 * Profit on a carpet = sell total − buy total (in the carpet's currency), which
 * equals (sell effective price/m − buy effective price/m) × area.
 * Returns null while the carpet is unsold.
 */
export function carpetProfitCents(c: CarpetValuation): number | null {
  const sell = carpetSellTotalCents(c)
  if (sell == null) return null
  return sell - carpetBuyTotalCents(c)
}
