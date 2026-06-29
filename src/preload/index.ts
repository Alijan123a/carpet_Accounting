import { contextBridge, ipcRenderer } from 'electron'

// Safe, minimal API exposed to the renderer via contextBridge.
// Business APIs are added in later phases.
const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  // TEMPORARY (Phase 1 dev page) — remove after verification.
  devResetSeedCompute: () => ipcRenderer.invoke('dev:resetSeedCompute')
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
