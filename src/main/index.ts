import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { initDatabase, closeDatabase, getDatabase } from './db'
import { registerClientsIpc } from './ipc/clients'
import { registerCarpetsIpc } from './ipc/carpets'
import { registerMaterialsIpc } from './ipc/materials'
import { registerExpensesIpc } from './ipc/expenses'
import { registerOrdersIpc } from './ipc/orders'
import { registerDashboardIpc } from './ipc/dashboard'
import { registerReportsIpc } from './ipc/reports'
import { registerPdfIpc } from './ipc/pdf'
import { registerArchiveIpc } from './ipc/archive'
import { registerAuthIpc } from './auth'
import { registerLicenseIpc } from './licenseManager'
import { registerConfigIpc } from './config'
import { registerBackupIpc, backupOnQuit, autoBackupDailyIfDue } from './backup'

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
  // Open the SQLite database (WAL mode) once at startup.
  initDatabase()
  console.log('[main] SQLite (WAL) ready; app starting')

  // Basic IPC handlers used by the shell.
  ipcMain.handle('app:getVersion', () => app.getVersion())

  // Clients module (Phase 2).
  registerClientsIpc(getDatabase)

  // Carpets module (Phase 3).
  registerCarpetsIpc(getDatabase)

  // Material / sales / payments (Phase 4).
  registerMaterialsIpc(getDatabase)

  // Expenses, dashboard, reports, PDF export (Phase 5).
  registerExpensesIpc(getDatabase)
  registerOrdersIpc(getDatabase)
  registerDashboardIpc(getDatabase)
  registerReportsIpc(getDatabase)
  registerPdfIpc()

  // Archive, auth, config, backup (Phase 6).
  registerArchiveIpc(getDatabase)
  registerAuthIpc()
  registerLicenseIpc()
  registerConfigIpc()
  registerBackupIpc()
  void autoBackupDailyIfDue()

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
