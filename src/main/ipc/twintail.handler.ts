import { ipcMain } from 'electron'
import { detectTwintailInstallation, importFromTwintail } from '../services/twintail-import-wizard'
import type { TwintailImportOptions } from '../../shared/types/twintail'

export function registerTwintailHandlers(): void {
  ipcMain.handle('twintail:detect', () => {
    return detectTwintailInstallation()
  })

  ipcMain.handle('twintail:import', async (_event, options: TwintailImportOptions) => {
    return importFromTwintail(options)
  })
}
