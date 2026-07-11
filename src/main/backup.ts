import { ipcMain, dialog, BrowserWindow } from 'electron'
import { join, basename } from 'path'
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync, rmSync } from 'fs'
import Database from 'better-sqlite3'
import { getRawDatabase, getDatabasePath, closeDatabase, initDatabase, reapplyMigrations } from './db'
import { getConfig, setConfig } from './config'
import { isPasswordSet, verifyPassword } from './auth'

const PREFIX = 'carpet-accounting-backup-'
const VALIDATE_TABLES = ['clients', 'carpets', 'materials', 'material_lines', 'transactions', 'expenses', 'carpet_statuses']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function timestampedName(): string {
  const d = new Date()
  // Millisecond resolution avoids same-second filename collisions.
  return `${PREFIX}${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}${pad(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, '0')}.db`
}

/**
 * Verify a file is a valid, complete SQLite DB for this app: integrity_check
 * passes, foreign keys are consistent, and every known table is queryable.
 * Accounting data is critical, so backups are validated before being trusted.
 */
export function validateSqlite(file: string): { ok: boolean; reason?: string } {
  let test: Database.Database | null = null
  try {
    test = new Database(file, { readonly: true, fileMustExist: true })
    const integ = test.pragma('integrity_check', { simple: true })
    if (integ !== 'ok') return { ok: false, reason: `integrity_check: ${String(integ)}` }
    const fk = test.pragma('foreign_key_check') as unknown[]
    if (Array.isArray(fk) && fk.length > 0) return { ok: false, reason: 'foreign_key_check failed' }
    for (const tbl of VALIDATE_TABLES) test.prepare(`SELECT COUNT(*) AS c FROM ${tbl}`).get()
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  } finally {
    try {
      test?.close()
    } catch {
      /* ignore */
    }
  }
}

function ensureFolder(folder: string): void {
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true })
}

/** Keep only the newest `keep` backups in the folder; delete the rest. */
function prune(folder: string, keep: number): void {
  if (!existsSync(folder)) return
  const safeKeep = Math.max(1, keep)
  const files = readdirSync(folder)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith('.db'))
    .map((f) => ({ f, t: statSync(join(folder, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  for (const { f } of files.slice(safeKeep)) {
    try {
      unlinkSync(join(folder, f))
    } catch {
      /* ignore */
    }
  }
}

/** Online backup to an explicit destination file, then validate it. */
async function backupToFile(dest: string): Promise<{ ok: boolean; path?: string; reason?: string }> {
  await getRawDatabase().backup(dest)
  const v = validateSqlite(dest)
  if (!v.ok) {
    try {
      unlinkSync(dest)
    } catch {
      /* ignore */
    }
    return { ok: false, reason: v.reason }
  }
  return { ok: true, path: dest }
}

/**
 * Synchronous backup for app-quit: checkpoint WAL into the main file then copy.
 * (The async .backup() is unreliable during shutdown.) This runs at quit in a
 * single-user app where no other writer is active, so the checkpoint→copy window
 * is safe. Manual + daily backups use the atomic online .backup() instead.
 */
export function autoBackupSync(): void {
  const cfg = getConfig()
  try {
    ensureFolder(cfg.backupFolder)
    getRawDatabase().pragma('wal_checkpoint(TRUNCATE)')
    const dest = join(cfg.backupFolder, timestampedName())
    copyFileSync(getDatabasePath(), dest)
    const v = validateSqlite(dest)
    if (!v.ok) {
      console.error('[backup] auto backup invalid, discarding:', v.reason)
      try {
        unlinkSync(dest)
      } catch {
        /* ignore */
      }
      return
    }
    setConfig({ lastAutoBackup: Date.now() })
    prune(cfg.backupFolder, cfg.backupRetention)
  } catch (e) {
    // Never block quit on a backup failure, but DO surface it.
    console.error('[backup] auto backup failed:', e)
  }
}

/** Daily backup check, run at startup. */
export async function autoBackupDailyIfDue(): Promise<void> {
  const cfg = getConfig()
  if (cfg.backupFrequency !== 'daily') return
  const due = cfg.lastAutoBackup == null || Date.now() - cfg.lastAutoBackup > 24 * 60 * 60 * 1000
  if (!due) return
  try {
    ensureFolder(cfg.backupFolder)
    const res = await backupToFile(join(cfg.backupFolder, timestampedName()))
    if (res.ok) {
      setConfig({ lastAutoBackup: Date.now() })
      prune(cfg.backupFolder, cfg.backupRetention)
    } else {
      console.error('[backup] daily backup invalid:', res.reason)
    }
  } catch (e) {
    console.error('[backup] daily backup failed:', e)
  }
}

/** Auto-backup hook for app quit (onClose / daily frequencies). */
export function backupOnQuit(): void {
  if (getConfig().backupFrequency === 'off') return
  autoBackupSync()
}

export function registerBackupIpc(): void {
  // Manual "Backup now": user chooses the destination.
  ipcMain.handle('backup:now', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const cfg = getConfig()
    ensureFolder(cfg.backupFolder)
    const res = await dialog.showSaveDialog(win ?? undefined!, {
      title: 'Backup database',
      defaultPath: join(cfg.backupFolder, timestampedName()),
      filters: [{ name: 'SQLite DB', extensions: ['db'] }]
    })
    if (res.canceled || !res.filePath) return { ok: false, canceled: true }
    return backupToFile(res.filePath)
  })

  // List backups in the configured folder (for the restore picker).
  ipcMain.handle('backup:list', () => {
    const folder = getConfig().backupFolder
    if (!existsSync(folder)) return []
    return readdirSync(folder)
      .filter((f) => f.startsWith(PREFIX) && f.endsWith('.db'))
      .map((f) => {
        const st = statSync(join(folder, f))
        return { name: f, path: join(folder, f), size: st.size, mtime: st.mtimeMs }
      })
      .sort((a, b) => b.mtime - a.mtime)
  })

  // Choose the backup folder.
  ipcMain.handle('backup:chooseFolder', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const res = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Choose backup folder',
      defaultPath: getConfig().backupFolder,
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true }
    const folder = res.filePaths[0]
    setConfig({ backupFolder: folder })
    return { ok: true, folder }
  })

  // DANGER ZONE: erase the entire database and start fresh. The password is
  // re-verified HERE in the main process (never trust the renderer), and a
  // validated safety backup is written to the backup folder first — even an
  // "erase everything" keeps one escape hatch. The pre-reset file does NOT use
  // the auto-backup PREFIX, so retention pruning never deletes it.
  //
  // The wipe happens IN-PLACE through the open connection (delete all rows,
  // reset autoincrement counters, re-run migrations, VACUUM) — never by
  // deleting the .db file, which fails with "access is denied" on Windows
  // whenever any handle is still open on it.
  ipcMain.handle(
    'backup:resetDb',
    async (_e, password: string): Promise<{ ok: boolean; reason?: string; backup?: string }> => {
      if (isPasswordSet() && !verifyPassword(String(password ?? '')).ok) {
        return { ok: false, reason: 'wrong_password' }
      }
      const cfg = getConfig()
      try {
        ensureFolder(cfg.backupFolder)
        const safety = join(cfg.backupFolder, timestampedName().replace(PREFIX, 'carpet-accounting-pre-reset-'))
        const raw = getRawDatabase()
        await raw.backup(safety)
        const v = validateSqlite(safety)
        if (!v.ok) return { ok: false, reason: `backup_failed: ${v.reason ?? ''}` }

        // Children before parents (belt and braces — FKs are also off while
        // wiping). The immutability triggers must go first or transactions
        // would refuse their own deletion; migrations recreate them below.
        const tables = [
          'transactions',
          'material_lines',
          'invoices',
          'carpets',
          'materials',
          'orders',
          'expenses',
          'expense_types',
          'system_changes',
          'carpet_statuses',
          'clients'
        ]
        raw.pragma('foreign_keys = OFF')
        try {
          raw.transaction(() => {
            raw.exec('DROP TRIGGER IF EXISTS trg_tx_no_update;')
            raw.exec('DROP TRIGGER IF EXISTS trg_tx_no_delete;')
            for (const t of tables) raw.exec(`DELETE FROM ${t};`)
            // Reset AUTOINCREMENT counters so ids/bill numbers start at 1 again.
            raw.exec(`DELETE FROM sqlite_sequence;`)
          })()
        } finally {
          raw.pragma('foreign_keys = ON')
        }
        reapplyMigrations() // recreate triggers + reseed carpet statuses
        raw.exec('VACUUM') // reclaim disk space (must run outside a transaction)
        return { ok: true, backup: safety }
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : String(e) }
      }
    }
  )

  // Restore from a backup file (validate source -> snapshot current -> replace ->
  // reopen). On ANY failure the original database is rolled back, so a failed
  // restore can never lose the current data or leave the app without a DB.
  ipcMain.handle('backup:restore', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const res = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Restore from backup',
      defaultPath: getConfig().backupFolder,
      filters: [{ name: 'SQLite DB', extensions: ['db'] }],
      properties: ['openFile']
    })
    if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true }
    const source = res.filePaths[0]

    const v = validateSqlite(source)
    if (!v.ok) return { ok: false, reason: v.reason }

    const dbPath = getDatabasePath()
    const safety = dbPath + '.pre-restore'
    try {
      // Snapshot the current DB first (so we can roll back).
      try {
        getRawDatabase().pragma('wal_checkpoint(TRUNCATE)')
      } catch {
        /* ignore — may already be closed */
      }
      closeDatabase()
      for (const ext of ['-wal', '-shm']) {
        const p = dbPath + ext
        if (existsSync(p)) {
          try {
            rmSync(p)
          } catch {
            /* ignore */
          }
        }
      }
      if (existsSync(dbPath)) copyFileSync(dbPath, safety)

      copyFileSync(source, dbPath)
      initDatabase()

      try {
        if (existsSync(safety)) rmSync(safety)
      } catch {
        /* ignore */
      }
      return { ok: true, path: source, restored: basename(source) }
    } catch (e) {
      // Roll back to the snapshot and reopen so the app stays usable.
      try {
        if (existsSync(safety)) copyFileSync(safety, dbPath)
      } catch {
        /* ignore */
      }
      try {
        initDatabase()
      } catch {
        /* ignore */
      }
      try {
        if (existsSync(safety)) rmSync(safety)
      } catch {
        /* ignore */
      }
      return { ok: false, reason: e instanceof Error ? e.message : String(e) }
    }
  })
}
