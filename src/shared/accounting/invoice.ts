import { floorCentsToWholeUnits, roundCents } from './money'

/**
 * Sell-invoice line math (pure). Mirrors the carpet total rule but works on the
 * invoice's own editable area/unit-price so a line can be overridden by hand
 * (CLAUDE.md §3: money stays in integer cents; the single float multiply — cents
 * × area — is rounded straight back to whole cents, then floored to a whole
 * major unit: 17.99 → 17, matching carpetTotalPriceCents).
 *
 * A line total DEFAULTS to `area × unitPrice`, but the user can override it (a
 * "sticky" manual total); those overrides live in the UI. This helper only
 * computes the default so the number is provably correct.
 */
export function invoiceLineTotalCents(area: number, unitPriceCents: number): number {
  return floorCentsToWholeUnits(roundCents(area * unitPriceCents))
}

/**
 * «متراژ» (m²) from dimensions entered in CENTIMETERS:
 * (length × width) / 10000, floored to 2 decimal places — e.g. 320 × 250 cm
 * → 8 m². The single source for every W×L→SQM derivation in the app.
 */
export function areaFromDimsCm(lengthCm: number, widthCm: number): number {
  return floorAreaTo2((lengthCm * widthCm) / 10000)
}

/**
 * Floor an area (m²) to 2 decimal places (8.096 → 8.09) — «متراژ» is written
 * with at most 2 decimals and the excess is dropped, never rounded up. The
 * value is pre-rounded at 8 decimals so binary float noise (3.2 × 2.5 =
 * 8.000000000000002, 2.3 × 1.3 = 2.9899999999999998) cannot tip the floor,
 * while a genuinely smaller value like 8.099999 still floors to 8.09.
 */
export function floorAreaTo2(area: number): number {
  return Math.floor(Math.round(area * 1e8) / 1e6) / 100
}

/** Grand total = sum of the (possibly overridden) line totals, in integer cents. */
export function invoiceGrandTotalCents(lineTotalsCents: number[]): number {
  return lineTotalsCents.reduce((sum, c) => sum + c, 0)
}
