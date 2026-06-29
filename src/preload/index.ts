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
    transactions: (params: unknown) => ipcRenderer.invoke('clients:transactions', params)
  },

  transactions: {
    reverse: (id: number) => ipcRenderer.invoke('transactions:reverse', id)
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
