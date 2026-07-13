import { floorCentsToWholeUnits, roundCents } from './money'
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
 * multiplication is rounded straight back to whole cents, then the total is
 * FLOORED to a whole major unit (17.99 → 17) — carpet totals carry no decimals
 * by business rule.
 */
export function carpetTotalPriceCents(
  ppmCents: number,
  deductionCents: number,
  area: number
): number {
  return floorCentsToWholeUnits(roundCents(effectivePricePerMeterCents(ppmCents, deductionCents) * area))
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

/**
 * A carpet DB-row shape carrying the STORED buy/sell totals alongside the raw
 * pricing fields. Field names match the `carpets` table columns so main-process
 * call sites can pass rows straight through.
 */
export interface CarpetProfitRow {
  area: number
  currency: Currency
  pricePerMeterCents: number
  sortDeductionCents: number
  totalPriceCents: number
  sellPricePerMeterCents: number | null
  sellSortDeductionCents: number | null
  sellTotalPriceCents: number | null
}

/**
 * Profit for a carpet ROW — the single helper every screen and report must use
 * so they all agree. Prefers the STORED totals (sell − buy): they equal the
 * posted ledger amounts, including a sell-invoice line's overridden
 * «متراژ»/«جمله», where recomputing from `area × price/m` would diverge.
 * Recomputation is only a fallback for legacy sold rows without a stored sell
 * total. Returns null while the carpet is unsold.
 */
export function carpetRowProfitCents(row: CarpetProfitRow): number | null {
  const sold = row.sellPricePerMeterCents != null || row.sellTotalPriceCents != null
  if (!sold) return null
  if (row.sellTotalPriceCents != null) return row.sellTotalPriceCents - row.totalPriceCents
  return carpetProfitCents({
    area: row.area,
    currency: row.currency,
    buyPricePerMeterCents: row.pricePerMeterCents,
    buyDeductionCents: row.sortDeductionCents,
    sellPricePerMeterCents: row.sellPricePerMeterCents,
    sellDeductionCents: row.sellSortDeductionCents
  })
}
