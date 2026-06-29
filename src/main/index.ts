import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { initDatabase, closeDatabase, getDatabase, getRawDatabase, reapplyMigrations } from './db'
import { devResetSeedCompute } from './accounting/ledger'
import { registerClientsIpc, probeClients } from './ipc/clients'
import { registerCarpetsIpc, probeCarpets } from './ipc/carpets'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Qaleen Trader',
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
  // Open the SQLite database (WAL mode) once at startup.
  initDatabase()
  console.log('[main] SQLite (WAL) ready; app starting')

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
  closeDatabase()
})
