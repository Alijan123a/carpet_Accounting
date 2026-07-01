import type { DevReport } from '../shared/accounting'
import type {
  ClientsApi,
  TransactionsApi,
  CarpetsApi,
  CarpetStatusesApi,
  MaterialsApi,
  ExpensesApi,
  DashboardApi,
  ReportsApi,
  PdfApi,
  ArchiveApi,
  AuthApi,
  LicenseApi,
  ConfigApi,
  BackupApi
} from '../shared/contracts'

export interface Api {
  getVersion: () => Promise<string>
  /** TEMPORARY (Phase 1 dev page) — remove after verification. */
  devResetSeedCompute: () => Promise<DevReport>
  clients: ClientsApi
  transactions: TransactionsApi
  carpets: CarpetsApi
  carpetStatuses: CarpetStatusesApi
  materials: MaterialsApi
  expenses: ExpensesApi
  dashboard: DashboardApi
  reports: ReportsApi
  pdf: PdfApi
  archive: ArchiveApi
  auth: AuthApi
  license: LicenseApi
  config: ConfigApi
  backup: BackupApi
}

declare global {
  interface Window {
    api: Api
  }
}
