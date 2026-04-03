import { app, ipcMain } from 'electron'

export function registerAppHandlers(): void {
  ipcMain.on('app:version', (event) => {
    event.returnValue = app.getVersion()
  })
}
