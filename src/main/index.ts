import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { unlinkSync } from 'fs'
import { initDatabase, closeDatabase, getDatabase, getRawDatabase, reapplyMigrations } from './db'
import { devResetSeedCompute } from './accounting/ledger'
import { registerClientsIpc, probeClients } from './ipc/clients'
import { registerCarpetsIpc, probeCarpets, probeFullFlow } from './ipc/carpets'
import { registerMaterialsIpc, probeMaterials } from './ipc/materials'
import { registerExpensesIpc } from './ipc/expenses'
import { registerDashboardIpc, dashboardSummary } from './ipc/dashboard'
import { registerReportsIpc, runReport } from './ipc/reports'
import { registerPdfIpc } from './ipc/pdf'
import { registerArchiveIpc, archiveLists } from './ipc/archive'
import { registerAuthIpc, probeAuthCrypto } from './auth'
import { registerConfigIpc } from './config'
import { registerBackupIpc, backupOnQuit, autoBackupDailyIfDue, validateSqlite } from './backup'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Carpet Accounting',
    backgroundColor: '#0b0f17',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite: load dev server URL in development, built file in production.
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Seed-only mode: fill the app's real database with clean demo data, then
  // exit without opening a window. Run with `CARPET_SEED_ONLY=1`. We pin the
  // userData path so the DB we seed matches a normal dev launch regardless of
  // how Electron was invoked (e.g. `electron out/main/index.js` otherwise
  // resolves the app name to "Electron" and would seed the wrong folder).
  const seedOnly = process.env['CARPET_SEED_ONLY'] === '1'
  if (seedOnly) app.setPath('userData', join(app.getPath('appData'), 'carpet-accounting'))

  // Open the SQLite database (WAL mode) once at startup.
  initDatabase()
  console.log('[main] SQLite (WAL) ready; app starting')

  if (seedOnly) {
    try {
      devResetSeedCompute(getDatabase(), (sql) => getRawDatabase().exec(sql), reapplyMigrations)
      // Fold the WAL back into the main file so the data is durable even on a
      // hard kill, and log a small confirmation for the caller.
      getRawDatabase().pragma('wal_checkpoint(TRUNCATE)')
      const count = (t: string): number =>
        (getRawDatabase().prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n
      console.log(
        `CARPET_SEED_DONE clients=${count('clients')} carpets=${count('carpets')} ` +
          `materials=${count('materials')} transactions=${count('transactions')}`
      )
    } catch (e) {
      console.error('[seed] CARPET_SEED_ONLY failed:', e)
    }
    closeDatabase()
    app.quit()
    return
  }

  // Basic IPC handlers used by the shell.
  ipcMain.handle('app:getVersion', () => app.getVersion())

  // TEMPORARY (Phase 1 dev page): reseed sample data and return computed numbers.
  ipcMain.handle('dev:resetSeedCompute', () =>
    devResetSeedCompute(getDatabase(), (sql) => getRawDatabase().exec(sql), reapplyMigrations)
  )

  // Clients module (Phase 2).
  registerClientsIpc(getDatabase)

  // Carpets module (Phase 3).
  registerCarpetsIpc(getDatabase)

  // Material / sales / payments (Phase 4).
  registerMaterialsIpc(getDatabase)

  // Expenses, dashboard, reports, PDF export (Phase 5).
  registerExpensesIpc(getDatabase)
  registerDashboardIpc(getDatabase)
  registerReportsIpc(getDatabase)
  registerPdfIpc()

  // Archive, auth, config, backup (Phase 6).
  registerArchiveIpc(getDatabase)
  registerAuthIpc()
  registerConfigIpc()
  registerBackupIpc()
  void autoBackupDailyIfDue()

  // TEMPORARY (Phase 1): when QALEEN_DEV_AUTOSEED=1, seed sample data and log
  // the computed report so the accounting numbers can be verified headlessly.
  if (process.env['QALEEN_DEV_AUTOSEED'] === '1') {
    try {
      const report = devResetSeedCompute(
        getDatabase(),
        (sql) => getRawDatabase().exec(sql),
        reapplyMigrations
      )
      console.log('QALEEN_DEV_REPORT_BEGIN' + JSON.stringify(report) + 'QALEEN_DEV_REPORT_END')
      const probe = probeClients(getDatabase())
      console.log('QALEEN_DEV_CLIENTS_BEGIN' + JSON.stringify(probe) + 'QALEEN_DEV_CLIENTS_END')
      const carpetProbe = probeCarpets(getDatabase())
      console.log('QALEEN_DEV_CARPETS_BEGIN' + JSON.stringify(carpetProbe) + 'QALEEN_DEV_CARPETS_END')
      const flow = probeFullFlow(getDatabase())
      console.log('QALEEN_DEV_FLOW_BEGIN' + JSON.stringify(flow) + 'QALEEN_DEV_FLOW_END')
      const matProbe = probeMaterials(getDatabase())
      console.log('QALEEN_DEV_MAT_BEGIN' + JSON.stringify(matProbe) + 'QALEEN_DEV_MAT_END')
      const dash = dashboardSummary(getDatabase(), 0, Number.MAX_SAFE_INTEGER)
      console.log(
        'QALEEN_DEV_DASH_BEGIN' +
          JSON.stringify({
            receivables: dash.receivables,
            payables: dash.payables,
            warehouseCount: dash.warehouseCount,
            materialStockKg: dash.materialStockKg,
            periodProfit: dash.periodProfit
          }) +
          'QALEEN_DEV_DASH_END'
      )
      const stmt = runReport(getDatabase(), 'clientStatement', { clientId: 2 })
      console.log('QALEEN_DEV_STMT_BEGIN' + JSON.stringify(stmt) + 'QALEEN_DEV_STMT_END')
      const reportIds = [
        'clientStatement',
        'warehouse',
        'periodicProfit',
        'soldList',
        'purchasedList',
        'receivablesPayables',
        'stagnant',
        'topClients',
        'turnover'
      ] as const
      const smoke = reportIds.map((id) => {
        try {
          const r = runReport(getDatabase(), id, { clientId: 2, days: 0, by: 'profit', granularity: 'month' })
          return { id, sections: r.sections.length, rows: r.sections.reduce((s, sec) => s + sec.rows.length, 0) }
        } catch (e) {
          return { id, error: e instanceof Error ? e.message : String(e) }
        }
      })
      console.log('QALEEN_DEV_REPORTS_BEGIN' + JSON.stringify(smoke) + 'QALEEN_DEV_REPORTS_END')

      // Phase 6 probes.
      console.log('QALEEN_DEV_AUTH_BEGIN' + JSON.stringify(probeAuthCrypto()) + 'QALEEN_DEV_AUTH_END')

      const raw = getRawDatabase()
      raw.exec('UPDATE materials SET archived = 1, archived_at = 0 WHERE id = 1')
      const archivedList = archiveLists(getDatabase())
      raw.exec('UPDATE materials SET archived = 0, archived_at = NULL WHERE id = 1')
      const afterRestore = archiveLists(getDatabase())
      console.log(
        'QALEEN_DEV_ARCHIVE_BEGIN' +
          JSON.stringify({
            archivedMaterials: archivedList.materials.length,
            sample: archivedList.materials[0] ?? null,
            afterRestore: afterRestore.materials.length
          }) +
          'QALEEN_DEV_ARCHIVE_END'
      )

      void (async () => {
        const dest = join(app.getPath('userData'), 'qaleen-probe-backup.db')
        try {
          await getRawDatabase().backup(dest)
          const valid = validateSqlite(dest)
          try {
            unlinkSync(dest)
          } catch {
            /* ignore */
          }
          console.log('QALEEN_DEV_BACKUP_BEGIN' + JSON.stringify({ backupOk: true, valid }) + 'QALEEN_DEV_BACKUP_END')
        } catch (err) {
          console.log(
            'QALEEN_DEV_BACKUP_BEGIN' + JSON.stringify({ backupOk: false, error: String(err) }) + 'QALEEN_DEV_BACKUP_END'
          )
        }
      })()
    } catch (e) {
      console.error('[dev] autoseed failed:', e)
    }
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  // Automatic backup (onClose/daily) before the DB is closed.
  backupOnQuit()
  closeDatabase()
})
