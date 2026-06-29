import type { DevReport } from '../shared/accounting'

export interface Api {
  getVersion: () => Promise<string>
  /** TEMPORARY (Phase 1 dev page) — remove after verification. */
  devResetSeedCompute: () => Promise<DevReport>
}

declare global {
  interface Window {
    api: Api
  }
}
