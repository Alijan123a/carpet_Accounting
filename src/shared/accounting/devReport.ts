import type { Currency, PerCurrency } from './types'
import type { PeriodProfitResult } from './period'

/**
 * TEMPORARY (Phase 1): shape of the data returned by the dev seed/compute IPC,
 * shared between main (producer) and renderer (consumer). Remove after Phase 1
 * verification together with the dev page.
 */
export interface DevReport {
  generatedAt: number
  clients: { id: number; name: string; balances: PerCurrency }[]
  carpets: {
    id: number
    label: string
    currency: Currency
    status: string
    buyTotalCents: number
    sellTotalCents: number | null
    profitCents: number | null
  }[]
  materials: {
    id: number
    name: string
    currency: Currency
    boughtKg: number
    soldKg: number
    avgBuyPerKgCents: number
    profitCents: number
  }[]
  period: { AFN: PeriodProfitResult; USD: PeriodProfitResult }
  transactionsCount: number
}
