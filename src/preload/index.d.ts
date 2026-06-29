import type { DevReport } from '../shared/accounting'
import type { ClientsApi, TransactionsApi, CarpetsApi, CarpetStatusesApi } from '../shared/contracts'

export interface Api {
  getVersion: () => Promise<string>
  /** TEMPORARY (Phase 1 dev page) — remove after verification. */
  devResetSeedCompute: () => Promise<DevReport>
  clients: ClientsApi
  transactions: TransactionsApi
  carpets: CarpetsApi
  carpetStatuses: CarpetStatusesApi
}

declare global {
  interface Window {
    api: Api
  }
}
