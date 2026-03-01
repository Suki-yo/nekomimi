// IPC handlers for mod operations (XXMI, etc.)

import { ipcMain, BrowserWindow } from 'electron'
import {
  isXXMIInstalled,
  isRunnerInstalled,
  downloadXXMI,
  downloadRunner,
  getInstalledRunner,
  getMods,
  toggleMod,
  installMod,
  deleteMod,
  enableAllMods,
  disableAllMods,
  renameMod,
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

  // ─────────────────────────────────────────────
  // Mod Management
  // ─────────────────────────────────────────────

  // Get list of mods for an importer
  ipcMain.handle('mods:list', (_event, { importer }: { importer: string }) => {
    console.log(`[mods] Listing mods for ${importer}`)
    return getMods(importer)
  })

  // Toggle a mod on/off
  ipcMain.handle('mods:toggle', (_event, { modPath, enabled }: { modPath: string; enabled: boolean }) => {
    console.log(`[mods] Toggling mod: ${modPath} → ${enabled ? 'enabled' : 'disabled'}`)
    return { success: toggleMod(modPath, enabled) }
  })

  // Install a mod from zip
  ipcMain.handle('mods:install', async (_event, { importer, zipPath }: { importer: string; zipPath: string }) => {
    console.log(`[mods] Installing mod from ${zipPath} to ${importer}`)
    return await installMod(importer, zipPath)
  })

  // Delete a mod
  ipcMain.handle('mods:delete', (_event, { modPath }: { modPath: string }) => {
    console.log(`[mods] Deleting mod: ${modPath}`)
    return { success: deleteMod(modPath) }
  })

  // Enable all mods for an importer
  ipcMain.handle('mods:enable-all', (_event, { importer }: { importer: string }) => {
    console.log(`[mods] Enabling all mods for ${importer}`)
    enableAllMods(importer)
  })

  // Disable all mods for an importer
  ipcMain.handle('mods:disable-all', (_event, { importer }: { importer: string }) => {
    console.log(`[mods] Disabling all mods for ${importer}`)
    disableAllMods(importer)
  })

  // Rename a mod (set custom display name)
  ipcMain.handle('mods:rename', (_event, { modPath, customName }: { modPath: string; customName: string }) => {
    console.log(`[mods] Renaming mod: ${modPath} → "${customName}"`)
    return renameMod(modPath, customName)
  })
}
