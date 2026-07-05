import { roundCents } from './money'

/**
 * Sell-invoice line math (pure). Mirrors the carpet total rule but works on the
 * invoice's own editable area/unit-price so a line can be overridden by hand
 * (CLAUDE.md §3: money stays in integer cents; the single float multiply — cents
 * × area — is rounded straight back to whole cents).
 *
 * A line total DEFAULTS to `area × unitPrice`, but the user can override it (a
 * "sticky" manual total); those overrides live in the UI. This helper only
 * computes the default so the number is provably correct.
 */
export function invoiceLineTotalCents(area: number, unitPriceCents: number): number {
  return roundCents(area * unitPriceCents)
}

/** Default area for a line = length × width (m²). Editable/sticky in the UI. */
export function invoiceLineAreaFromDims(length: number, width: number): number {
  return length * width
}

/** Grand total = sum of the (possibly overridden) line totals, in integer cents. */
export function invoiceGrandTotalCents(lineTotalsCents: number[]): number {
  return lineTotalsCents.reduce((sum, c) => sum + c, 0)
}
