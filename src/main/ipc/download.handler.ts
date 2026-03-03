// IPC handlers for game downloads

import { ipcMain, BrowserWindow } from 'electron'
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
    async (event, { gameId, biz, destDir, manifestUrl }: {
      gameId: string
      biz: HoyoGameBiz
      destDir: string
      manifestUrl?: string
    }) => {
      console.log(`[download] Starting download for ${gameId} (${biz})`)
      const win = BrowserWindow.fromWebContents(event.sender)

      const result = await startGameDownload({
        gameId,
        biz,
        destDir,
        manifestUrl,
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
}
