import { ipcMain } from 'electron'
import { getPreflightReport, invalidatePreflight } from '../services/preflight'

export function registerPreflightHandlers(): void {
  ipcMain.handle('preflight:check', async () => {
    return getPreflightReport(false)
  })

  ipcMain.handle('preflight:refresh', async () => {
    invalidatePreflight()
    return getPreflightReport(true)
  })
}
