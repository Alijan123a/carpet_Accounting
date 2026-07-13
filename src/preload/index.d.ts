import type {
  ClientsApi,
  TransactionsApi,
  CarpetsApi,
  InvoicesApi,
  CarpetStatusesApi,
  MaterialsApi,
  ExpensesApi,
  ExpenseTypesApi,
  OrdersApi,
  DashboardApi,
  ReportsApi,
  PdfApi,
  FilesApi,
  ArchiveApi,
  AuthApi,
  LicenseApi,
  ConfigApi,
  BackupApi,
  SystemApi
} from '../shared/contracts'

export interface Api {
  getVersion: () => Promise<string>
  clients: ClientsApi
  transactions: TransactionsApi
  carpets: CarpetsApi
  invoices: InvoicesApi
  carpetStatuses: CarpetStatusesApi
  materials: MaterialsApi
  expenses: ExpensesApi
  expenseTypes: ExpenseTypesApi
  orders: OrdersApi
  dashboard: DashboardApi
  reports: ReportsApi
  pdf: PdfApi
  files: FilesApi
  archive: ArchiveApi
  auth: AuthApi
  license: LicenseApi
  config: ConfigApi
  backup: BackupApi
  system: SystemApi
}

declare global {
  interface Window {
    api: Api
  }
}
