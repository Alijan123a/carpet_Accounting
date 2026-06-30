import { contextBridge, ipcRenderer } from 'electron'

// Safe, minimal API exposed to the renderer via contextBridge.
const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),

  // TEMPORARY (Phase 1 dev page) — remove after verification.
  devResetSeedCompute: () => ipcRenderer.invoke('dev:resetSeedCompute'),

  // Clients module (Phase 2).
  clients: {
    list: (params: unknown) => ipcRenderer.invoke('clients:list', params),
    get: (id: number) => ipcRenderer.invoke('clients:get', id),
    create: (input: unknown) => ipcRenderer.invoke('clients:create', input),
    update: (id: number, input: unknown) => ipcRenderer.invoke('clients:update', id, input),
    archive: (id: number) => ipcRenderer.invoke('clients:archive', id),
    restore: (id: number) => ipcRenderer.invoke('clients:restore', id),
    transactions: (params: unknown) => ipcRenderer.invoke('clients:transactions', params),
    addPayment: (input: unknown) => ipcRenderer.invoke('clients:addPayment', input)
  },

  transactions: {
    reverse: (id: number) => ipcRenderer.invoke('transactions:reverse', id)
  },

  // Carpets module (Phase 3).
  carpets: {
    list: (params: unknown) => ipcRenderer.invoke('carpets:list', params),
    get: (id: number) => ipcRenderer.invoke('carpets:get', id),
    create: (input: unknown) => ipcRenderer.invoke('carpets:create', input),
    update: (id: number, input: unknown) => ipcRenderer.invoke('carpets:update', id, input),
    archive: (id: number) => ipcRenderer.invoke('carpets:archive', id),
    restore: (id: number) => ipcRenderer.invoke('carpets:restore', id),
    sortGrades: () => ipcRenderer.invoke('carpets:sortGrades'),
    sell: (input: unknown) => ipcRenderer.invoke('carpets:sell', input)
  },

  materials: {
    list: (params: unknown) => ipcRenderer.invoke('materials:list', params),
    get: (id: number) => ipcRenderer.invoke('materials:get', id),
    create: (input: unknown) => ipcRenderer.invoke('materials:create', input),
    addLine: (input: unknown) => ipcRenderer.invoke('materials:addLine', input),
    archive: (id: number) => ipcRenderer.invoke('materials:archive', id),
    restore: (id: number) => ipcRenderer.invoke('materials:restore', id)
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

  // Dashboard (Phase 5).
  dashboard: {
    summary: (params: unknown) => ipcRenderer.invoke('dashboard:summary', params)
  },

  // Reports (Phase 5).
  reports: {
    run: (id: string, params: unknown) => ipcRenderer.invoke('reports:run', { id, params })
  },

  // PDF export (Phase 5).
  pdf: {
    save: (fileName: string, bytes: Uint8Array) => ipcRenderer.invoke('pdf:save', fileName, bytes)
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

  // App config (Phase 6).
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (patch: unknown) => ipcRenderer.invoke('config:set', patch)
  },

  // Backup (Phase 6).
  backup: {
    now: () => ipcRenderer.invoke('backup:now'),
    list: () => ipcRenderer.invoke('backup:list'),
    chooseFolder: () => ipcRenderer.invoke('backup:chooseFolder'),
    restore: () => ipcRenderer.invoke('backup:restore')
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
