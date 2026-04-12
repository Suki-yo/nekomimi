import { app, ipcMain } from 'electron'

export function registerAppHandlers(): void {
  ipcMain.handle('app:version', () => {
    return app.getVersion()
  })
}
