// IPC handlers for game downloads

import { ipcMain, BrowserWindow } from 'electron'
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
import { expandHome } from '../services/paths'
import type { HoyoGameBiz, DownloadProgress } from '../../shared/types/download'

type DownloadStartResult = { success: boolean; error?: string }

function canSendToWindow(win: BrowserWindow | null): win is BrowserWindow {
  return !!win && !win.isDestroyed() && !win.webContents.isDestroyed()
}

function sendToWindow(win: BrowserWindow | null, channel: string, payload: unknown): void {
  if (canSendToWindow(win)) {
    win.webContents.send(channel, payload)
  }
}

function registerDownloadStartHandler<TArgs extends { gameId: string; destDir: string }>(
  channel: string,
  logMessage: (args: TArgs) => string,
  startFn: (
    args: TArgs & { destDir: string; onProgress: (progress: DownloadProgress) => void }
  ) => Promise<DownloadStartResult>,
): void {
  ipcMain.handle(channel, async (event, args: TArgs) => {
    console.log(logMessage(args))
    const win = BrowserWindow.fromWebContents(event.sender)

    const result = await startFn({
      ...args,
      destDir: expandHome(args.destDir),
      onProgress: (progress: DownloadProgress) => {
        sendToWindow(win, 'download:progress', progress)
      },
    })

    if (result.success) {
      sendToWindow(win, 'download:complete', { gameId: args.gameId })
    } else {
      sendToWindow(win, 'download:error', { gameId: args.gameId, error: result.error })
    }

    return result
  })
}

function registerUpdateCheckHandler<TArgs extends { installDir?: string }, TResult>(
  channel: string,
  checkFn: (args: TArgs) => Promise<TResult>,
): void {
  ipcMain.handle(channel, async (_event, args: TArgs) => {
    return await checkFn({
      ...args,
      installDir: args.installDir ? expandHome(args.installDir) : undefined,
    } as TArgs)
  })
}

export const registerDownloadHandlers = () => {
  // Fetch game version info from official API
  ipcMain.handle(
    'download:fetch-info',
    async (_event, { biz }: { biz: HoyoGameBiz }) => {
      console.log(`[download] Fetching version info for ${biz}`)
      return await getGameVersionInfo(biz)
    }
  )

  registerDownloadStartHandler(
    'download:start',
    ({ gameId, biz }) => `[download] Starting download for ${gameId} (${biz})`,
    async (args: {
      gameId: string
      biz: HoyoGameBiz
      destDir: string
      manifestUrl?: string
      useTwintail?: boolean
      preferVersion?: string
      onProgress: (progress: DownloadProgress) => void
    }) => {
      return await startGameDownload(args)
    },
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

  registerUpdateCheckHandler(
    'download:check-updates',
    async ({ biz, currentVersion, installDir }: { biz: HoyoGameBiz; currentVersion?: string; installDir?: string }) => {
      console.log(`[download] Checking updates for ${biz} (current: ${currentVersion ?? 'unknown'})`)

      // Use Twintail for update checks (more reliable)
      const latest = await getGameVersionInfo(biz)

      if (!latest) {
        console.warn(`[download] Failed to fetch version info for ${biz}`)
        return {
          hasUpdate: false,
          currentVersion,
          latestVersion: undefined,
          latestVersionLabel: undefined,
          updateChannel: undefined,
          downloadMode: undefined,
        }
      }

      const detectedVersion = installDir
        ? await detectHoyoInstalledVersion(installDir, biz)
        : null

      const latestVersion = latest.preloadVersion ?? latest.version
      const latestVersionLabel = latest.preloadVersionLabel ?? latest.versionLabel ?? latestVersion
      const updateChannel = latest.preloadVersion ? 'preload' : 'stable'
      const preservePredownloadVersion =
        !!currentVersion
        && currentVersion === latestVersion
        && !!detectedVersion
        && detectedVersion === latest.version
      const effectiveCurrentVersion = preservePredownloadVersion
        ? currentVersion
        : detectedVersion || currentVersion || undefined
      const hasUpdate = !!effectiveCurrentVersion && latestVersion !== effectiveCurrentVersion

      console.log(
        `[download] ${biz} - current: ${effectiveCurrentVersion ?? 'unknown'}, latest: ${latestVersion}, hasUpdate: ${hasUpdate}, channel: ${updateChannel}`
      )

      return {
        hasUpdate,
        currentVersion: effectiveCurrentVersion,
        latestVersion,
        latestVersionLabel,
        updateChannel,
        downloadMode: latest.downloadMode,
      }
    }
  )

  // Fetch Endfield version info
  ipcMain.handle('download:fetch-endfield-info', async () => {
    return await fetchEndfieldVersionInfo()
  })

  registerDownloadStartHandler(
    'download:start-endfield',
    ({ destDir }) => `[download] Starting Endfield download to ${destDir}`,
    async (args: { gameId: string; destDir: string; onProgress: (progress: DownloadProgress) => void }) => {
      return await startEndfieldDownload(args)
    },
  )

  // Fetch Wuthering Waves version info
  ipcMain.handle('download:fetch-wuwa-info', async () => {
    return await fetchWuwaVersionInfo()
  })

  registerDownloadStartHandler(
    'download:start-wuwa',
    ({ destDir }) => `[download] Starting Wuthering Waves download to ${destDir}`,
    async (args: { gameId: string; destDir: string; onProgress: (progress: DownloadProgress) => void }) => {
      return await startWuwaDownload(args)
    },
  )

  registerUpdateCheckHandler(
    'download:check-wuwa-updates',
    async ({ currentVersion, installDir }: { currentVersion?: string; installDir?: string }) => {
      const latest = await fetchWuwaVersionInfo()
      if (!latest) {
        return {
          hasUpdate: false,
          currentVersion,
          latestVersion: undefined,
        }
      }

      const detectedVersion = installDir
        ? await detectWuwaInstalledVersion(installDir)
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
