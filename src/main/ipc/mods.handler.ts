// IPC handlers for mod operations (XXMI, etc.)

import { ipcMain, BrowserWindow } from 'electron'
import {
  isXXMIInstalled,
  isRunnerInstalled,
  downloadXXMI,
  downloadRunner,
  getInstalledRunner,
} from '../services/mod-manager'

export const registerModsHandlers = () => {
  // Check if XXMI is installed
  ipcMain.handle('mods:xxmi-status', () => {
    const status = {
      xxmiInstalled: isXXMIInstalled(),
      runnerInstalled: isRunnerInstalled(),
    }
    console.log('[mods] XXMI status:', status)
    return status
  })

  // Download XXMI with progress updates
  ipcMain.handle('mods:xxmi-download', async (event) => {
    console.log('[mods] Starting XXMI download...')
    const win = BrowserWindow.fromWebContents(event.sender)

    const result = await downloadXXMI((percent) => {
      console.log(`[mods] Download progress: ${percent}%`)
      // Send progress to renderer
      win?.webContents.send('mods:xxmi-progress', percent)
    })

    console.log('[mods] Download result:', result)
    return result
  })

  // Download Proton-GE runner with progress updates
  ipcMain.handle('mods:runner-download', async (event) => {
    console.log('[mods] Starting runner download...')
    const win = BrowserWindow.fromWebContents(event.sender)

    const result = await downloadRunner((percent) => {
      console.log(`[mods] Runner download progress: ${percent}%`)
      // Send progress to renderer
      win?.webContents.send('mods:runner-progress', percent)
    })

    console.log('[mods] Runner download result:', result)
    return result
  })

  // Get installed runner info
  ipcMain.handle('mods:runner-info', () => {
    return getInstalledRunner()
  })
}
