import { app, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import type { AppConfig } from '../shared/contracts'

/**
 * App-level configuration the MAIN process needs (so it can run automatic
 * backups even while the renderer is closed). Stored in the per-user app-data
 * folder, independent of the database. UI-only prefs (theme/language/calendar/
 * default currency) stay in the renderer's persisted store.
 */
function defaults(): AppConfig {
  return {
    backupFolder: join(app.getPath('userData'), 'backups'),
    backupFrequency: 'onClose',
    backupRetention: 10,
    lastAutoBackup: null
  }
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

let cache: AppConfig | null = null

export function getConfig(): AppConfig {
  if (cache) return cache
  let cfg = defaults()
  if (existsSync(configPath())) {
    try {
      cfg = { ...cfg, ...(JSON.parse(readFileSync(configPath(), 'utf8')) as Partial<AppConfig>) }
    } catch {
      /* keep defaults on a corrupt file */
    }
  }
  cache = cfg
  return cfg
}

export function setConfig(patch: Partial<AppConfig>): AppConfig {
  const cfg = { ...getConfig(), ...patch }
  // Defense in depth: never let retention drop below 1 (would prune all backups).
  cfg.backupRetention = Math.max(1, Math.floor(cfg.backupRetention) || 1)
  cache = cfg
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8')
  return cfg
}

export function registerConfigIpc(): void {
  ipcMain.handle('config:get', () => getConfig())
  ipcMain.handle('config:set', (_e, patch: Partial<AppConfig>) => setConfig(patch))
}
