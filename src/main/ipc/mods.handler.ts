// IPC handlers for mod operations (XXMI, etc.)

import { ipcMain, BrowserWindow, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { FSWatcher } from 'fs'
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
  getModsPath,
} from '../services/mod-manager'

const modDirectoryWatchers = new Map<string, FSWatcher>()
const modChangeDebounceTimers = new Map<string, NodeJS.Timeout>()

function emitModsChanged(importer: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('mods:changed', { importer })
  }
}

function scheduleModsChanged(importer: string): void {
  const existingTimer = modChangeDebounceTimers.get(importer)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  const timer = setTimeout(() => {
    modChangeDebounceTimers.delete(importer)
    emitModsChanged(importer)
  }, 150)

  modChangeDebounceTimers.set(importer, timer)
}

function ensureModsWatcher(importer: string): void {
  if (modDirectoryWatchers.has(importer)) {
    return
  }

  const modsPath = getModsPath(importer)
  fs.mkdirSync(modsPath, { recursive: true })

  try {
    const watcher = fs.watch(modsPath, () => {
      scheduleModsChanged(importer)
    })
    modDirectoryWatchers.set(importer, watcher)
  } catch (error) {
    console.warn(`[mods] Failed to watch ${modsPath}:`, error)
  }
}

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
    ensureModsWatcher(importer)
    return getMods(importer)
  })

  // Toggle a mod on/off
  ipcMain.handle('mods:toggle', (_event, { modPath, enabled }: { modPath: string; enabled: boolean }) => {
    console.log(`[mods] Toggling mod: ${modPath} → ${enabled ? 'enabled' : 'disabled'}`)
    const success = toggleMod(modPath, enabled)
    if (success) {
      scheduleModsChanged(path.basename(path.dirname(modPath)))
    }
    return { success }
  })

  // Install a mod from archive or folder
  ipcMain.handle('mods:install', async (_event, { importer, sourcePath }: { importer: string; sourcePath: string }) => {
    console.log(`[mods] Installing mod from ${sourcePath} to ${importer}`)
    ensureModsWatcher(importer)
    const result = await installMod(importer, sourcePath)
    if (result.success) {
      scheduleModsChanged(importer)
    }
    return result
  })

  // Delete a mod
  ipcMain.handle('mods:delete', (_event, { modPath }: { modPath: string }) => {
    console.log(`[mods] Deleting mod: ${modPath}`)
    const success = deleteMod(modPath)
    if (success) {
      scheduleModsChanged(path.basename(path.dirname(modPath)))
    }
    return { success }
  })

  // Enable all mods for an importer
  ipcMain.handle('mods:enable-all', (_event, { importer }: { importer: string }) => {
    console.log(`[mods] Enabling all mods for ${importer}`)
    ensureModsWatcher(importer)
    enableAllMods(importer)
    scheduleModsChanged(importer)
  })

  // Disable all mods for an importer
  ipcMain.handle('mods:disable-all', (_event, { importer }: { importer: string }) => {
    console.log(`[mods] Disabling all mods for ${importer}`)
    ensureModsWatcher(importer)
    disableAllMods(importer)
    scheduleModsChanged(importer)
  })

  // Rename a mod (set custom display name)
  ipcMain.handle('mods:rename', (_event, { modPath, customName }: { modPath: string; customName: string }) => {
    console.log(`[mods] Renaming mod: ${modPath} → "${customName}"`)
    const result = renameMod(modPath, customName)
    if (result.success) {
      scheduleModsChanged(path.basename(path.dirname(modPath)))
    }
    return result
  })

  ipcMain.handle('mods:open-folder', async (_event, { importer }: { importer: string }) => {
    try {
      const modsPath = getModsPath(importer)
      fs.mkdirSync(modsPath, { recursive: true })
      ensureModsWatcher(importer)
      const markerPath = path.join(modsPath, '.nekomimi')
      if (!fs.existsSync(markerPath)) {
        fs.writeFileSync(markerPath, '')
      }
      shell.showItemInFolder(markerPath)
      return { success: true, path: modsPath }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'failed to open mods folder',
      }
    }
  })
}
