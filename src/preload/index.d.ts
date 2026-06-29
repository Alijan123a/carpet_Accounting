export interface Api {
  getVersion: () => Promise<string>
}

declare global {
  interface Window {
    api: Api
  }
}
