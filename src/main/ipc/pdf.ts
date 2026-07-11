import { ipcMain, dialog, shell, app, BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { execFile } from 'child_process'

/** Show a native Save dialog and persist `bytes` to the chosen path. */
async function saveBytes(
  fileName: string,
  bytes: Uint8Array,
  filterName: string,
  extensions: string[]
): Promise<{ ok: boolean; path?: string; canceled?: boolean }> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const res = await dialog.showSaveDialog(win ?? undefined!, {
    defaultPath: fileName,
    filters: [{ name: filterName, extensions }]
  })
  if (res.canceled || !res.filePath) return { ok: false, canceled: true }
  await writeFile(res.filePath, Buffer.from(bytes))
  return { ok: true, path: res.filePath }
}

/**
 * Persist PDF bytes (generated in the renderer via @react-pdf/renderer) through
 * a native Save dialog, plus a generic file-save channel (Excel export) and a
 * print channel. Keeping dialogs + filesystem + shell in the main process is
 * the Electron-correct place for this.
 */
export function registerPdfIpc(): void {
  ipcMain.handle('pdf:save', (_e, fileName: string, bytes: Uint8Array) => saveBytes(fileName, bytes, 'PDF', ['pdf']))

  ipcMain.handle(
    'file:save',
    (_e, fileName: string, bytes: Uint8Array, filterName: string, extensions: string[]) =>
      saveBytes(fileName, bytes, filterName, extensions)
  )

  // Print a PDF: write it to the OS temp dir and hand it to the Windows shell
  // "Print" verb (the default PDF app prints to the default printer). If no
  // app registers that verb, fall back to opening the file so the user can
  // print from the viewer; the renderer tells them via `opened`.
  ipcMain.handle(
    'pdf:print',
    async (_e, fileName: string, bytes: Uint8Array): Promise<{ ok: boolean; opened?: boolean }> => {
      const path = join(app.getPath('temp'), fileName)
      await writeFile(path, Buffer.from(bytes))
      const printed = await new Promise<boolean>((resolve) => {
        execFile(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `Start-Process -FilePath '${path.replace(/'/g, "''")}' -Verb Print`
          ],
          (err) => resolve(!err)
        )
      })
      if (printed) return { ok: true }
      const openErr = await shell.openPath(path)
      return { ok: false, opened: !openErr }
    }
  )
}
