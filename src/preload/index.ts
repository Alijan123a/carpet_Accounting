import { contextBridge, ipcRenderer } from 'electron'

// Safe, minimal API exposed to the renderer via contextBridge.
const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),

  // Clients module (Phase 2).
  clients: {
    list: (params: unknown) => ipcRenderer.invoke('clients:list', params),
    get: (id: number) => ipcRenderer.invoke('clients:get', id),
    create: (input: unknown) => ipcRenderer.invoke('clients:create', input),
    update: (id: number, input: unknown) => ipcRenderer.invoke('clients:update', id, input),
    archive: (id: number) => ipcRenderer.invoke('clients:archive', id),
    restore: (id: number) => ipcRenderer.invoke('clients:restore', id),
    remove: (id: number) => ipcRenderer.invoke('clients:remove', id),
    transactions: (params: unknown) => ipcRenderer.invoke('clients:transactions', params),
    addPayment: (input: unknown) => ipcRenderer.invoke('clients:addPayment', input),
    updatePayment: (id: number, input: unknown) => ipcRenderer.invoke('clients:updatePayment', id, input)
  },

  transactions: {
    reverse: (id: number) => ipcRenderer.invoke('transactions:reverse', id)
  },

  // Carpets module (Phase 3).
  carpets: {
    list: (params: unknown) => ipcRenderer.invoke('carpets:list', params),
    get: (id: number) => ipcRenderer.invoke('carpets:get', id),
    create: (input: unknown) => ipcRenderer.invoke('carpets:create', input),
    createBatch: (input: unknown) => ipcRenderer.invoke('carpets:createBatch', input),
    update: (id: number, input: unknown) => ipcRenderer.invoke('carpets:update', id, input),
    archive: (id: number) => ipcRenderer.invoke('carpets:archive', id),
    restore: (id: number) => ipcRenderer.invoke('carpets:restore', id),
    remove: (id: number) => ipcRenderer.invoke('carpets:remove', id),
    sortGrades: () => ipcRenderer.invoke('carpets:sortGrades'),
    sell: (input: unknown) => ipcRenderer.invoke('carpets:sell', input),
    nextInvoiceNumber: () => ipcRenderer.invoke('carpets:nextInvoiceNumber'),
    sellInvoice: (input: unknown) => ipcRenderer.invoke('carpets:sellInvoice', input)
  },

  // Sell invoices / bills («بل فروش») grouped for the buyer page.
  invoices: {
    listForBuyer: (clientId: number) => ipcRenderer.invoke('invoices:listForBuyer', clientId),
    get: (id: number) => ipcRenderer.invoke('invoices:get', id)
  },

  materials: {
    list: (params: unknown) => ipcRenderer.invoke('materials:list', params),
    get: (id: number) => ipcRenderer.invoke('materials:get', id),
    create: (input: unknown) => ipcRenderer.invoke('materials:create', input),
    update: (id: number, input: unknown) => ipcRenderer.invoke('materials:update', id, input),
    addLine: (input: unknown) => ipcRenderer.invoke('materials:addLine', input),
    removeLine: (lineId: number) => ipcRenderer.invoke('materials:removeLine', lineId),
    linesForClient: (clientId: number) => ipcRenderer.invoke('materials:linesForClient', clientId),
    archive: (id: number) => ipcRenderer.invoke('materials:archive', id),
    restore: (id: number) => ipcRenderer.invoke('materials:restore', id),
    remove: (id: number) => ipcRenderer.invoke('materials:remove', id)
  },

  carpetStatuses: {
    list: () => ipcRenderer.invoke('carpetStatuses:list'),
    create: (input: unknown) => ipcRenderer.invoke('carpetStatuses:create', input),
    rename: (id: number, input: unknown) => ipcRenderer.invoke('carpetStatuses:rename', id, input),
    remove: (id: number) => ipcRenderer.invoke('carpetStatuses:remove', id)
  },

  // Expenses (Phase 5).
  expenses: {
    list: (params: unknown) => ipcRenderer.invoke('expenses:list', params),
    create: (input: unknown) => ipcRenderer.invoke('expenses:create', input),
    update: (id: number, input: unknown) => ipcRenderer.invoke('expenses:update', id, input),
    remove: (id: number) => ipcRenderer.invoke('expenses:remove', id),
    categories: () => ipcRenderer.invoke('expenses:categories')
  },

  // User-managed expense categories.
  expenseTypes: {
    list: () => ipcRenderer.invoke('expenseTypes:list'),
    create: (input: unknown) => ipcRenderer.invoke('expenseTypes:create', input),
    rename: (id: number, input: unknown) => ipcRenderer.invoke('expenseTypes:rename', id, input),
    remove: (id: number) => ipcRenderer.invoke('expenseTypes:remove', id)
  },

  // Orders («سفارشات»).
  orders: {
    list: (params: unknown) => ipcRenderer.invoke('orders:list', params),
    get: (id: number) => ipcRenderer.invoke('orders:get', id),
    create: (input: unknown) => ipcRenderer.invoke('orders:create', input),
    update: (id: number, input: unknown) => ipcRenderer.invoke('orders:update', id, input),
    setStatus: (id: number, status: unknown) => ipcRenderer.invoke('orders:setStatus', id, status),
    updateItems: (id: number, items: unknown) => ipcRenderer.invoke('orders:updateItems', id, items),
    assignedToSeller: (sellerClientId: number) =>
      ipcRenderer.invoke('orders:assignedToSeller', sellerClientId),
    remove: (id: number) => ipcRenderer.invoke('orders:remove', id),
    nextOrderNo: () => ipcRenderer.invoke('orders:nextOrderNo')
  },

  // Dashboard (Phase 5).
  dashboard: {
    summary: (params: unknown) => ipcRenderer.invoke('dashboard:summary', params),
    balancesByClient: () => ipcRenderer.invoke('dashboard:balancesByClient'),
    profitDetail: (params: unknown) => ipcRenderer.invoke('dashboard:profitDetail', params),
    stockDetail: () => ipcRenderer.invoke('dashboard:stockDetail')
  },

  // Reports (Phase 5).
  reports: {
    run: (id: string, params: unknown) => ipcRenderer.invoke('reports:run', { id, params })
  },

  // PDF export (Phase 5) + printing.
  pdf: {
    save: (fileName: string, bytes: Uint8Array) => ipcRenderer.invoke('pdf:save', fileName, bytes),
    print: (fileName: string, bytes: Uint8Array) => ipcRenderer.invoke('pdf:print', fileName, bytes)
  },

  // Generic file save (Excel export).
  files: {
    save: (fileName: string, bytes: Uint8Array, filterName: string, extensions: string[]) =>
      ipcRenderer.invoke('file:save', fileName, bytes, filterName, extensions)
  },

  // Archive (Phase 6).
  archive: {
    list: () => ipcRenderer.invoke('archive:list')
  },

  // Password protection (Phase 6).
  auth: {
    status: () => ipcRenderer.invoke('auth:status'),
    setup: (password: string) => ipcRenderer.invoke('auth:setup', password),
    verify: (password: string) => ipcRenderer.invoke('auth:verify', password),
    change: (oldPassword: string, newPassword: string) => ipcRenderer.invoke('auth:change', oldPassword, newPassword)
  },

  // License / device lock.
  license: {
    status: () => ipcRenderer.invoke('license:status'),
    activate: (key: string) => ipcRenderer.invoke('license:activate', key),
    fingerprint: () => ipcRenderer.invoke('license:fingerprint')
  },

  // App config (Phase 6).
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (patch: unknown) => ipcRenderer.invoke('config:set', patch)
  },

  // System changes (audit log + undo).
  system: {
    list: (params: unknown) => ipcRenderer.invoke('system:list', params),
    undo: (changeId: number) => ipcRenderer.invoke('system:undo', changeId)
  },

  // Backup (Phase 6).
  backup: {
    now: () => ipcRenderer.invoke('backup:now'),
    list: () => ipcRenderer.invoke('backup:list'),
    chooseFolder: () => ipcRenderer.invoke('backup:chooseFolder'),
    restore: () => ipcRenderer.invoke('backup:restore'),
    resetDb: (password: string) => ipcRenderer.invoke('backup:resetDb', password)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (fallback when context isolation is disabled)
  window.api = api
}
