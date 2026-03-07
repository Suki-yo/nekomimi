import { ipcMain, BrowserWindow } from 'electron'
import { isSteamrtInstalled, findSteamrt, downloadSteamrt } from '../services/steamrt'

export const registerSteamrtHandlers = () => {
  ipcMain.handle('steamrt:status', () => {
    return {
      installed: isSteamrtInstalled(),
      path: findSteamrt(),
    }
  })

  ipcMain.handle('steamrt:install', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await downloadSteamrt((percent) => {
      win?.webContents.send('steamrt:progress', percent)
    })
    return result
  })
}
