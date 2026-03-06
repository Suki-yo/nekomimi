// IPC handlers for game downloads

import { ipcMain, BrowserWindow } from 'electron'
import * as os from 'os'
import * as path from 'path'
import {
  getGameVersionInfo,
  startGameDownload,
  cancelDownload,
  isDownloadInProgress,
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
          win?.webContents.send('download:progress', progress)
        },
      })

      if (result.success) {
        win?.webContents.send('download:complete', { gameId })
      } else {
        win?.webContents.send('download:error', { gameId, error: result.error })
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
    async (_event, { biz, currentVersion }: { biz: HoyoGameBiz; currentVersion: string }) => {
      console.log(`[download] Checking updates for ${biz} (current: ${currentVersion})`)

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

      const hasUpdate = latest.version !== currentVersion
      console.log(`[download] ${biz} - current: ${currentVersion}, latest: ${latest.version}, hasUpdate: ${hasUpdate}`)

      return {
        hasUpdate,
        currentVersion,
        latestVersion: latest.version,
        downloadMode: latest.downloadMode,
      }
    }
  )
}
