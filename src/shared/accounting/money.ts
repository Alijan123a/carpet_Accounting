import type { Currency } from './types'

/**
 * Money utilities.
 *
 * RULE (CLAUDE.md §3): money is stored and computed as INTEGER CENTS. Floating
 * point is only ever introduced when multiplying money by a physical quantity
 * (carpet area in m², material weight in kg), and the result is immediately
 * rounded back to whole cents with {@link roundCents}. Money is never stored as
 * a float.
 */

/** Round a fractional-cent amount to the nearest whole cent. */
export function roundCents(value: number): number {
  // Math.round rounds half away from zero for positive and toward zero for the
  // .5 case on negatives; for our magnitudes this matches expected accounting
  // rounding. We guard against -0.
  const r = Math.round(value)
  return r === 0 ? 0 : r
}

/**
 * Floor integer cents down to a whole major unit (e.g. 1799 → 1700, i.e.
 * 17.99 → 17.00). Carpet/invoice totals are always written without decimals —
 * the fraction is dropped, never rounded up.
 */
export function floorCentsToWholeUnits(cents: number): number {
  return Math.floor(cents / 100) * 100
}

/**
 * Format integer cents for DISPLAY as a 2-decimal, thousands-grouped string.
 * e.g. 4550 -> "45.50", -1234567 -> "-12,345.67".
 * Display only — never feed the result back into calculations.
 */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const whole = Math.trunc(abs / 100)
  const frac = abs % 100
  const grouped = whole.toLocaleString('en-US')
  return `${sign}${grouped}.${frac.toString().padStart(2, '0')}`
}

/**
 * Like {@link formatCents} but omits a zero fraction (e.g. 1700 → "17",
 * 1750 → "17.50"). Used where totals are floored to whole units and a trailing
 * ".00" would only be noise (invoice grand totals).
 */
export function formatCentsCompact(cents: number): string {
  const full = formatCents(cents)
  return full.endsWith('.00') ? full.slice(0, -3) : full
}

/**
 * Display symbol per currency (CLAUDE.md §6): the dollar sign for USD and the
 * Afghani sign (U+060B) for AFN. Currency CODES stay in storage/contracts;
 * only DISPLAY uses the symbol — always go through this helper.
 */
export const CURRENCY_SYMBOLS: Record<Currency, string> = { USD: '$', AFN: '؋' }

/** The display symbol for a currency, e.g. 'USD' -> "$". */
export function currencySymbol(currency: Currency): string {
  return CURRENCY_SYMBOLS[currency]
}

/** Format integer cents with the currency symbol, e.g. "45.50 ؋". */
export function formatMoney(cents: number, currency: Currency): string {
  return `${formatCents(cents)} ${CURRENCY_SYMBOLS[currency]}`
}

/**
 * Parse a user-entered money string (major units, e.g. "1,250.50") into integer
 * cents. Returns null for empty/invalid input. Grouping commas are ignored.
 * Used by money input fields; the parsed cents are what we store.
 */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, '')
  if (cleaned === '') return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return roundCents(value * 100)
}

/**
 * Inverse of {@link parseMoneyToCents}: integer cents -> a plain major-unit
 * string suitable for pre-filling a numeric input (e.g. 4550 -> "45.5"). This
 * is the single place the cents->input conversion lives so dialogs never do the
 * arithmetic inline.
 */
export function centsToInput(cents: number): string {
  return (cents / 100).toString()
}
