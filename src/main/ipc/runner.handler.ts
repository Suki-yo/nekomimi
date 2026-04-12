import { ipcMain, BrowserWindow } from 'electron'
import {
  checkRunnerUpdates,
  installRunner,
  listRunners,
  removeRunner,
} from '../services/runner-registry'

function canSendToWindow(win: BrowserWindow | null): win is BrowserWindow {
  return !!win && !win.isDestroyed() && !win.webContents.isDestroyed()
}

export function registerRunnerHandlers(): void {
  ipcMain.handle('runner:list', async () => {
    return listRunners()
  })

  ipcMain.handle('runner:check-updates', async () => {
    return checkRunnerUpdates()
  })

  ipcMain.handle('runner:install', async (event, request) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return installRunner(request, (percent) => {
      if (canSendToWindow(win)) {
        win.webContents.send('runner:progress', percent)
      }
    })
  })

  ipcMain.handle('runner:remove', async (_event, request) => {
    return removeRunner(request)
  })
}
