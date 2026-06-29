import { ipcMain, dialog, BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'

/**
 * Persist PDF bytes (generated in the renderer via @react-pdf/renderer) through
 * a native Save dialog. Keeping the dialog + file write in the main process is
 * the Electron-correct place for filesystem access.
 */
export function registerPdfIpc(): void {
  ipcMain.handle(
    'pdf:save',
    async (_e, fileName: string, bytes: Uint8Array): Promise<{ ok: boolean; path?: string; canceled?: boolean }> => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const res = await dialog.showSaveDialog(win ?? undefined!, {
        defaultPath: fileName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (res.canceled || !res.filePath) return { ok: false, canceled: true }
      await writeFile(res.filePath, Buffer.from(bytes))
      return { ok: true, path: res.filePath }
    }
  )
}
