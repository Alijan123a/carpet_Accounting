import type { Currency } from './types'

/**
 * Period profit (CLAUDE.md §4): aggregate gross profit minus expenses over a
 * date range, computed PER CURRENCY (AFN and USD are never combined).
 *
 * Inputs are pre-computed profit/expense entries tagged with a currency and a
 * business date (epoch ms). The DB layer is responsible for turning carpets and
 * material lines into these entries; this function only filters and sums, which
 * keeps it pure and trivially testable.
 */

export interface ProfitEntry {
  currency: Currency
  profitCents: number
  /** Business date, epoch ms (e.g. carpet sale date / material sell line date). */
  date: number
}

export interface ExpenseEntry {
  currency: Currency
  amountCents: number
  /** Expense business date, epoch ms. */
  date: number
}

export interface PeriodProfitResult {
  currency: Currency
  fromDate: number
  toDate: number
  grossProfitCents: number
  expensesCents: number
  netProfitCents: number
}

export interface PeriodProfitArgs {
  carpetProfits: readonly ProfitEntry[]
  materialProfits: readonly ProfitEntry[]
  expenses: readonly ExpenseEntry[]
  /** Inclusive range, epoch ms. */
  fromDate: number
  toDate: number
  currency: Currency
}

/**
 * Net period profit for one currency = (carpet profit + material profit) within
 * [fromDate, toDate] − expenses within the same range, all in that currency.
 */
export function periodProfit(args: PeriodProfitArgs): PeriodProfitResult {
  const { fromDate, toDate, currency } = args
  const inRange = (d: number): boolean => d >= fromDate && d <= toDate

  const sumProfit = (entries: readonly ProfitEntry[]): number => {
    let s = 0
    for (const e of entries) {
      if (e.currency === currency && inRange(e.date)) s += e.profitCents
    }
    return s
  }

  const grossProfitCents = sumProfit(args.carpetProfits) + sumProfit(args.materialProfits)

  let expensesCents = 0
  for (const e of args.expenses) {
    if (e.currency === currency && inRange(e.date)) expensesCents += e.amountCents
  }

  return {
    currency,
    fromDate,
    toDate,
    grossProfitCents,
    expensesCents,
    netProfitCents: grossProfitCents - expensesCents
  }
}
