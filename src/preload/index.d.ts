import type {
  ClientsApi,
  TransactionsApi,
  CarpetsApi,
  CarpetStatusesApi,
  MaterialsApi,
  ExpensesApi,
  OrdersApi,
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
  clients: ClientsApi
  transactions: TransactionsApi
  carpets: CarpetsApi
  carpetStatuses: CarpetStatusesApi
  materials: MaterialsApi
  expenses: ExpensesApi
  orders: OrdersApi
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
