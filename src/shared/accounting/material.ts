import { roundCents } from './money'
import type { Currency } from './types'

/**
 * Material (tar) accounting. Material is measured in KILOGRAMS, stored as a REAL
 * number of kg (decimal allowed — e.g. 12.5 kg). Money is integer cents; the
 * single price × kg multiplication is rounded straight back to whole cents.
 */

export interface MaterialLineLike {
  direction: 'buy' | 'sell'
  currency: Currency
  kilograms: number
  pricePerKgCents: number
}

/** Line total = price/kg × kilograms, in integer cents. */
export function materialLineTotalCents(pricePerKgCents: number, kilograms: number): number {
  return roundCents(pricePerKgCents * kilograms)
}

/**
 * Weighted-average buy price per kg across a material lot's buy lines, in
 * integer cents. Used as the cost basis for selling. Returns 0 if nothing was
 * bought.
 */
export function weightedAverageBuyPricePerKgCents(buyLines: readonly MaterialLineLike[]): number {
  let totalKg = 0
  let totalCostCents = 0
  for (const l of buyLines) {
    totalKg += l.kilograms
    totalCostCents += materialLineTotalCents(l.pricePerKgCents, l.kilograms)
  }
  if (totalKg <= 0) return 0
  return roundCents(totalCostCents / totalKg)
}

/**
 * Profit on a single SELL line = (sell price/kg − buy cost/kg) × kg sold
 * (CLAUDE.md §4). Integer cents.
 */
export function materialLineProfitCents(
  sellLine: MaterialLineLike,
  buyPricePerKgCents: number
): number {
  return roundCents((sellLine.pricePerKgCents - buyPricePerKgCents) * sellLine.kilograms)
}

/**
 * Aggregate profit for a material lot: cost basis is the weighted-average buy
 * price/kg; profit is summed over all sell lines. Assumes a single currency per
 * lot (a material lot has one currency); callers group lots by currency and
 * never sum AFN with USD.
 */
export function aggregateMaterialProfitCents(
  buyLines: readonly MaterialLineLike[],
  sellLines: readonly MaterialLineLike[]
): number {
  const avgBuy = weightedAverageBuyPricePerKgCents(buyLines)
  let profit = 0
  for (const l of sellLines) {
    profit += materialLineProfitCents(l, avgBuy)
  }
  return profit
}
