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

/** Format integer cents with the currency code, e.g. "45.50 AFN". */
export function formatMoney(cents: number, currency: Currency): string {
  return `${formatCents(cents)} ${currency}`
}
