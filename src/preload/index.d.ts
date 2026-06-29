import type { DevReport } from '../shared/accounting'
import type { ClientsApi, TransactionsApi } from '../shared/contracts'

export interface Api {
  getVersion: () => Promise<string>
  /** TEMPORARY (Phase 1 dev page) — remove after verification. */
  devResetSeedCompute: () => Promise<DevReport>
  clients: ClientsApi
  transactions: TransactionsApi
}

declare global {
  interface Window {
    api: Api
  }
}
