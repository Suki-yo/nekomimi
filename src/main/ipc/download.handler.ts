// IPC handlers for game downloads

import { ipcMain, BrowserWindow } from 'electron'
import * as os from 'os'
import * as path from 'path'
import {
  getGameVersionInfo,
  startGameDownload,
  cancelDownload,
  isDownloadInProgress,
  detectHoyoInstalledVersion,
  fetchEndfieldVersionInfo,
  startEndfieldDownload,
  fetchWuwaVersionInfo,
  detectWuwaInstalledVersion,
  startWuwaDownload,
} from '../services/download'
import type { HoyoGameBiz, DownloadProgress } from '../../shared/types/download'

export const registerDownloadHandlers = () => {
  // Fetch game version info from official API
  ipcMain.handle(
    'download:fetch-info',
    async (_event, { biz }: { biz: HoyoGameBiz }) => {
      console.log(`[download] Fetching version info for ${biz}`)
      return await getGameVersionInfo(biz)
    }
  )

  // Start a game download
  ipcMain.handle(
    'download:start',
    async (event, { gameId, biz, destDir, manifestUrl, useTwintail, preferVersion }: {
      gameId: string
      biz: HoyoGameBiz
      destDir: string
      manifestUrl?: string
      useTwintail?: boolean
      preferVersion?: string
    }) => {
      console.log(`[download] Starting download for ${gameId} (${biz})`)
      const win = BrowserWindow.fromWebContents(event.sender)

      // Expand ~ to actual home directory
      const resolvedDestDir = destDir.startsWith('~')
        ? path.join(os.homedir(), destDir.slice(1))
        : destDir

      const result = await startGameDownload({
        gameId,
        biz,
        destDir: resolvedDestDir,
        manifestUrl,
        useTwintail,
        preferVersion,
        onProgress: (progress: DownloadProgress) => {
          if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send('download:progress', progress)
          }
        },
      })

      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
        if (result.success) {
          win.webContents.send('download:complete', { gameId })
        } else {
          win.webContents.send('download:error', { gameId, error: result.error })
        }
      }

      return result
    }
  )

  // Cancel an active download
  ipcMain.handle(
    'download:cancel',
    async (_event, { gameId }: { gameId: string }) => {
      console.log(`[download] Cancelling download for ${gameId}`)
      return { success: cancelDownload(gameId) }
    }
  )

  // Check if a download is in progress
  ipcMain.handle(
    'download:status',
    async (_event, { gameId }: { gameId: string }) => {
      return { inProgress: isDownloadInProgress(gameId) }
    }
  )

  // Check for game updates
  ipcMain.handle(
    'download:check-updates',
    async (_event, { biz, currentVersion, installDir }: { biz: HoyoGameBiz; currentVersion?: string; installDir?: string }) => {
      console.log(`[download] Checking updates for ${biz} (current: ${currentVersion ?? 'unknown'})`)

      // Use Twintail for update checks (more reliable)
      const latest = await getGameVersionInfo(biz)

      if (!latest) {
        console.warn(`[download] Failed to fetch version info for ${biz}`)
        return {
          hasUpdate: false,
          currentVersion,
          latestVersion: undefined,
          downloadMode: undefined,
        }
      }

      const resolvedInstallDir = installDir
        ? (installDir.startsWith('~') ? path.join(os.homedir(), installDir.slice(1)) : installDir)
        : undefined

      const detectedVersion = resolvedInstallDir
        ? await detectHoyoInstalledVersion(resolvedInstallDir, biz)
        : null

      const effectiveCurrentVersion = detectedVersion || currentVersion || undefined
      const hasUpdate = !!effectiveCurrentVersion && latest.version !== effectiveCurrentVersion

      console.log(
        `[download] ${biz} - current: ${effectiveCurrentVersion ?? 'unknown'}, latest: ${latest.version}, hasUpdate: ${hasUpdate}`
      )

      return {
        hasUpdate,
        currentVersion: effectiveCurrentVersion,
        latestVersion: latest.version,
        downloadMode: latest.downloadMode,
      }
    }
  )

  // Fetch Endfield version info
  ipcMain.handle('download:fetch-endfield-info', async () => {
    return await fetchEndfieldVersionInfo()
  })

  // Start Endfield download
  ipcMain.handle(
    'download:start-endfield',
    async (event, { gameId, destDir }: { gameId: string; destDir: string }) => {
      console.log(`[download] Starting Endfield download to ${destDir}`)
      const win = BrowserWindow.fromWebContents(event.sender)
      const resolvedDestDir = destDir.startsWith('~')
        ? path.join(os.homedir(), destDir.slice(1))
        : destDir

      const result = await startEndfieldDownload({
        gameId,
        destDir: resolvedDestDir,
        onProgress: (progress: DownloadProgress) => {
          if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send('download:progress', progress)
          }
        },
      })

      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
        if (result.success) {
          win.webContents.send('download:complete', { gameId })
        } else {
          win.webContents.send('download:error', { gameId, error: result.error })
        }
      }

      return result
    }
  )

  // Fetch Wuthering Waves version info
  ipcMain.handle('download:fetch-wuwa-info', async () => {
    return await fetchWuwaVersionInfo()
  })

  // Start Wuthering Waves download
  ipcMain.handle(
    'download:start-wuwa',
    async (event, { gameId, destDir }: { gameId: string; destDir: string }) => {
      console.log(`[download] Starting Wuthering Waves download to ${destDir}`)
      const win = BrowserWindow.fromWebContents(event.sender)
      const resolvedDestDir = destDir.startsWith('~')
        ? path.join(os.homedir(), destDir.slice(1))
        : destDir

      const result = await startWuwaDownload({
        gameId,
        destDir: resolvedDestDir,
        onProgress: (progress: DownloadProgress) => {
          if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send('download:progress', progress)
          }
        },
      })

      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
        if (result.success) {
          win.webContents.send('download:complete', { gameId })
        } else {
          win.webContents.send('download:error', { gameId, error: result.error })
        }
      }

      return result
    }
  )

  // Check Wuthering Waves updates
  ipcMain.handle(
    'download:check-wuwa-updates',
    async (_event, { currentVersion, installDir }: { currentVersion?: string; installDir?: string }) => {
      const latest = await fetchWuwaVersionInfo()
      if (!latest) {
        return {
          hasUpdate: false,
          currentVersion,
          latestVersion: undefined,
        }
      }

      const resolvedInstallDir = installDir
        ? (installDir.startsWith('~') ? path.join(os.homedir(), installDir.slice(1)) : installDir)
        : undefined

      const detectedVersion = resolvedInstallDir
        ? await detectWuwaInstalledVersion(resolvedInstallDir)
        : null

      const effectiveCurrentVersion = detectedVersion || currentVersion || undefined

      return {
        hasUpdate: !!effectiveCurrentVersion && effectiveCurrentVersion !== latest.version,
        currentVersion: effectiveCurrentVersion,
        latestVersion: latest.version,
      }
    }
  )
}
