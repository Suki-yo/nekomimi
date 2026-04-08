import { useState, type Dispatch, type SetStateAction } from 'react'
import { CATALOG_ENTRIES, createCatalogForm, findCatalogEntryForGame, findInstalledCatalogGame, type CatalogDetails, type CatalogEntry, type CatalogFormState, type CatalogId } from '@/data/catalog'
import type { Selection } from '@/types/app-shell'
import type { DownloadProgress, HoyoVersionInfo, WuwaVersionInfo } from '@shared/types/download'
import type { DetectedRunner, Game } from '@shared/types/game'

interface UseCatalogManagerOptions {
  clearDownloadProgress: (gameId: string) => void
  games: Game[]
  reportStatus: (message: string, selection?: Selection) => void
  runners: DetectedRunner[]
  onGameAdded: (game: Game) => void
  updateGame: (gameId: string, updates: Partial<Game>) => Promise<Game>
  buildHoyoDownloadState: (
    mode: 'zip' | 'sophon',
    currentVersion: string | undefined,
    latestVersion: string | undefined,
    installPath?: string,
    latestVersionLabel?: string,
    updateChannel?: 'stable' | 'preload',
    totalBytes?: number,
  ) => Game['download']
  buildWuwaDownloadState: (
    currentVersion: string | undefined,
    latestVersion: string | undefined,
    installPath?: string,
  ) => Game['download']
  formatBytes: (bytes: number) => string
}

interface UseCatalogManagerResult {
  autoAddCatalogGame: (entry: CatalogEntry) => Promise<void>
  catalogDetails: Record<CatalogId, CatalogDetails>
  catalogForms: Record<CatalogId, CatalogFormState>
  handleCatalogBrowse: (entry: CatalogEntry) => Promise<void>
  handleCatalogCancel: (entry: CatalogEntry) => Promise<void>
  handleCatalogLocateBrowse: (entry: CatalogEntry) => Promise<void>
  handleCatalogLocateConfirm: (entry: CatalogEntry) => Promise<void>
  handleCatalogStart: (entry: CatalogEntry) => Promise<void>
  loadCatalogDetails: () => Promise<void>
  refreshSingleHoyoGame: (game: Game, completedVersion?: string) => Promise<Game>
  refreshSingleWuwaGame: (game: Game) => Promise<Game>
  setCatalogForms: Dispatch<SetStateAction<Record<CatalogId, CatalogFormState>>>
  syncCatalogGames: (nextGames: Game[]) => Promise<Game[]>
}

function getParentDirectory(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index === -1 ? filePath : normalized.slice(0, index)
}

export function useCatalogManager({
  clearDownloadProgress,
  games,
  reportStatus,
  runners,
  onGameAdded,
  updateGame,
  buildHoyoDownloadState,
  buildWuwaDownloadState,
  formatBytes,
}: UseCatalogManagerOptions): UseCatalogManagerResult {
  const [catalogDetails, setCatalogDetails] = useState<Record<CatalogId, CatalogDetails>>({
    genshin: { version: null, sizeLabel: 'loading...', error: null },
    starrail: { version: null, sizeLabel: 'loading...', error: null },
    zzz: { version: null, sizeLabel: 'loading...', error: null },
    endfield: { version: null, sizeLabel: 'loading...', error: null },
    wuwa: { version: null, sizeLabel: 'loading...', error: null },
  })
  const [catalogForms, setCatalogForms] = useState<Record<CatalogId, CatalogFormState>>(() =>
    Object.fromEntries(CATALOG_ENTRIES.map((entry) => [entry.id, createCatalogForm(entry)])) as Record<CatalogId, CatalogFormState>,
  )

  async function syncCatalogGames(nextGames: Game[]): Promise<Game[]> {
    const syncedHoyoGames = await syncHoyoGames(nextGames)
    return syncWuwaGames(syncedHoyoGames)
  }

  async function syncHoyoGames(nextGames: Game[]): Promise<Game[]> {
    const hoyoGames = nextGames.filter((game) => findCatalogEntryForGame(game)?.kind === 'hoyo')
    if (hoyoGames.length === 0) {
      return nextGames
    }

    const infoRequests = new Map<string, Promise<HoyoVersionInfo | null>>()
    const loadInfo = (biz: 'genshin' | 'starrail' | 'zzz') => {
      if (!infoRequests.has(biz)) {
        infoRequests.set(biz, window.api.invoke('download:fetch-info', { biz }))
      }
      return infoRequests.get(biz)!
    }

    const updates = await Promise.all(
      hoyoGames.map(async (game) => {
        const entry = findCatalogEntryForGame(game)
        if (entry?.kind !== 'hoyo' || !entry.biz) {
          return game
        }

        const [result, info] = await Promise.all([
          window.api.invoke('download:check-updates', {
            biz: entry.biz,
            currentVersion: game.download?.currentVersion ?? game.update?.currentVersion,
            installDir: game.directory,
          }),
          loadInfo(entry.biz),
        ])

        const nextCurrentVersion =
          result.currentVersion ?? game.download?.currentVersion ?? game.update?.currentVersion
        const nextLatestVersion =
          result.latestVersion ?? info?.preloadVersion ?? info?.version ?? game.download?.latestVersion
        const nextLatestVersionLabel =
          result.latestVersionLabel
          ?? info?.preloadVersionLabel
          ?? info?.versionLabel
          ?? nextLatestVersion
        const nextMode =
          result.downloadMode
          ?? info?.downloadMode
          ?? (game.download?.mode === 'zip' || game.download?.mode === 'sophon' ? game.download.mode : 'sophon')
        const nextUpdateChannel =
          result.updateChannel
          ?? (info?.preloadVersion ? 'preload' : 'stable')
          ?? game.download?.updateChannel
          ?? 'stable'

        if (!nextCurrentVersion && !nextLatestVersion) {
          return game
        }

        const nextDownload = buildHoyoDownloadState(
          nextMode,
          nextCurrentVersion,
          nextLatestVersion,
          game.directory,
          nextLatestVersionLabel,
          nextUpdateChannel,
          result.updateSizeBytes,
        )

        const unchanged =
          game.download?.status === nextDownload?.status
          && game.download?.mode === nextDownload?.mode
          && game.download?.currentVersion === nextDownload?.currentVersion
          && game.download?.latestVersion === nextDownload?.latestVersion
          && game.download?.latestVersionLabel === nextDownload?.latestVersionLabel
          && game.download?.updateChannel === nextDownload?.updateChannel
          && game.download?.totalBytes === nextDownload?.totalBytes
          && game.download?.installPath === nextDownload?.installPath

        if (unchanged) {
          return game
        }

        return updateGame(game.id, { download: nextDownload })
      }),
    )

    return nextGames.map((game) => updates.find((candidate) => candidate.id === game.id) ?? game)
  }

  async function syncWuwaGames(nextGames: Game[]): Promise<Game[]> {
    const wuwaGames = nextGames.filter((game) => findCatalogEntryForGame(game)?.id === 'wuwa')
    if (wuwaGames.length === 0) {
      return nextGames
    }

    const updates = await Promise.all(
      wuwaGames.map(async (game) => {
        const result = await window.api.invoke('download:check-wuwa-updates', {
          currentVersion: game.download?.currentVersion,
          installDir: game.directory,
        })

        if (!result.currentVersion && !result.latestVersion) {
          return game
        }

        const nextDownload = buildWuwaDownloadState(
          result.currentVersion ?? game.download?.currentVersion,
          result.latestVersion ?? game.download?.latestVersion,
          game.directory,
        )

        const unchanged =
          game.download?.status === nextDownload?.status
          && game.download?.mode === nextDownload?.mode
          && game.download?.currentVersion === nextDownload?.currentVersion
          && game.download?.latestVersion === nextDownload?.latestVersion
          && game.download?.installPath === nextDownload?.installPath

        if (unchanged) {
          return game
        }

        return updateGame(game.id, { download: nextDownload })
      }),
    )

    return nextGames.map((game) => updates.find((candidate) => candidate.id === game.id) ?? game)
  }

  async function refreshSingleHoyoGame(game: Game, completedVersion?: string): Promise<Game> {
    const entry = findCatalogEntryForGame(game)
    if (entry?.kind !== 'hoyo' || !entry.biz) {
      return game
    }

    const result = await window.api.invoke('download:check-updates', {
      biz: entry.biz,
      currentVersion: game.download?.currentVersion ?? game.update?.currentVersion,
      installDir: game.directory,
    })

    let nextCurrentVersion =
      result.currentVersion
      ?? game.download?.currentVersion
      ?? game.update?.currentVersion
    const nextLatestVersion = result.latestVersion ?? game.download?.latestVersion
    const nextLatestVersionLabel =
      result.latestVersionLabel
      ?? game.download?.latestVersionLabel
      ?? nextLatestVersion
    const nextMode =
      result.downloadMode
      ?? (game.download?.mode === 'zip' || game.download?.mode === 'sophon' ? game.download.mode : 'sophon')
    const nextUpdateChannel = result.updateChannel ?? game.download?.updateChannel ?? 'stable'

    if (
      completedVersion
      && nextUpdateChannel === 'preload'
      && completedVersion === nextLatestVersion
    ) {
      nextCurrentVersion = completedVersion
    }

    const nextDownload = buildHoyoDownloadState(
      nextMode,
      nextCurrentVersion,
      nextLatestVersion,
      game.directory,
      nextLatestVersionLabel,
      nextUpdateChannel,
      result.updateSizeBytes ?? game.download?.totalBytes,
    )

    return updateGame(game.id, { download: nextDownload, installed: true })
  }

  async function refreshSingleWuwaGame(game: Game): Promise<Game> {
    const result = await window.api.invoke('download:check-wuwa-updates', {
      currentVersion: game.download?.currentVersion,
      installDir: game.directory,
    })

    const nextDownload = buildWuwaDownloadState(
      result.currentVersion ?? game.download?.currentVersion,
      result.latestVersion ?? game.download?.latestVersion,
      game.directory,
    )

    return updateGame(game.id, { download: nextDownload })
  }

  async function loadCatalogDetails(): Promise<void> {
    const nextDetails: Record<CatalogId, CatalogDetails> = {
      genshin: { version: null, sizeLabel: 'unavailable', error: null },
      starrail: { version: null, sizeLabel: 'unavailable', error: null },
      zzz: { version: null, sizeLabel: 'unavailable', error: null },
      endfield: { version: null, sizeLabel: 'unavailable', error: null },
      wuwa: { version: null, sizeLabel: 'unavailable', error: null },
    }

    const hoyoEntries = CATALOG_ENTRIES.filter((entry) => entry.kind === 'hoyo')

    const hoyoResults = await Promise.allSettled(
      hoyoEntries.map(async (entry) => {
        const info = await window.api.invoke('download:fetch-info', { biz: entry.biz! })
        return { entry, info }
      }),
    )

    hoyoResults.forEach((result, index) => {
      const entry = hoyoEntries[index]
      if (result.status === 'fulfilled' && result.value.info) {
        const info = result.value.info as HoyoVersionInfo
        const stableVersion = info.version
        const latestVersion = info.preloadVersion ?? info.version
        const latestVersionLabel = info.preloadVersionLabel ?? info.versionLabel ?? latestVersion
        const updateChannel = info.preloadVersion ? 'preload' : 'stable'
        nextDetails[entry.id] = {
          version: latestVersion,
          versionLabel: latestVersionLabel,
          stableVersion,
          latestVersion,
          latestVersionLabel,
          updateChannel,
          sizeLabel: info.zipSize ? formatBytes(info.zipSize) : 'official manifest',
          error: null,
        }
      } else {
        const reason = result.status === 'rejected' ? result.reason : 'Version unavailable'
        nextDetails[entry.id] = {
          version: null,
          versionLabel: null,
          sizeLabel: 'unavailable',
          error: reason instanceof Error ? reason.message : String(reason),
        }
      }
    })

    try {
      const info = await window.api.invoke('download:fetch-endfield-info', {})
      if (info) {
        nextDetails.endfield = {
          version: info.version,
          sizeLabel: formatBytes(info.totalSize),
          installedSizeLabel: formatBytes(info.installedSize),
          error: null,
        }
      } else {
        nextDetails.endfield.error = 'Version unavailable'
      }
    } catch (error) {
      nextDetails.endfield.error = error instanceof Error ? error.message : 'Version unavailable'
    }

    try {
      const info = await window.api.invoke('download:fetch-wuwa-info', {})
      if (info) {
        const wuwaInfo = info as WuwaVersionInfo
        nextDetails.wuwa = {
          version: wuwaInfo.version,
          sizeLabel: formatBytes(wuwaInfo.totalSize),
          error: null,
        }
      } else {
        nextDetails.wuwa.error = 'Version unavailable'
      }
    } catch (error) {
      nextDetails.wuwa.error = error instanceof Error ? error.message : 'Version unavailable'
    }

    setCatalogDetails(nextDetails)
  }

  async function handleCatalogBrowse(entry: CatalogEntry): Promise<void> {
    const filePath = await window.api.openFile()
    if (!filePath) {
      return
    }

    setCatalogForms((current) => ({
      ...current,
      [entry.id]: {
        ...current[entry.id],
        installDir: getParentDirectory(filePath),
      },
    }))
  }

  async function handleCatalogLocateBrowse(entry: CatalogEntry): Promise<void> {
    const filePath = await window.api.openFile()
    if (!filePath) {
      return
    }

    setCatalogForms((current) => ({
      ...current,
      [entry.id]: {
        ...current[entry.id],
        locateExePath: filePath,
        locateError: null,
        locating: true,
      },
    }))

    try {
      const detected = await window.api.invoke('game:detect', { exePath: filePath })
      setCatalogForms((current) => ({
        ...current,
        [entry.id]: {
          ...current[entry.id],
          locateDirectory: detected.directory,
          locatePrefix: detected.prefix ?? entry.defaultPrefix,
          locateError: null,
          locating: false,
        },
      }))
      reportStatus(`located ${entry.name.toLowerCase()}`, { type: 'catalog', catalogId: entry.id })
    } catch (error) {
      setCatalogForms((current) => ({
        ...current,
        [entry.id]: {
          ...current[entry.id],
          locateError: error instanceof Error ? error.message : 'Detection failed',
          locating: false,
        },
      }))
      reportStatus(`locate failed: ${error instanceof Error ? error.message : 'unknown error'}`, { type: 'catalog', catalogId: entry.id })
    }
  }

  async function handleCatalogLocateConfirm(entry: CatalogEntry): Promise<void> {
    const form = catalogForms[entry.id]
    if (!form.locateExePath || !form.locateDirectory) {
      reportStatus('choose an executable first', { type: 'catalog', catalogId: entry.id })
      return
    }

    const runnerPath = runners[0]?.path ?? ''
    const hoyoVersionState = entry.kind === 'hoyo'
      ? await window.api.invoke('download:check-updates', {
          biz: entry.biz!,
          installDir: form.locateDirectory,
        })
      : null
    const wuwaVersionState = entry.id === 'wuwa'
      ? await window.api.invoke('download:check-wuwa-updates', { installDir: form.locateDirectory })
      : null
    const game = await window.api.invoke('game:add', {
      name: entry.name,
      slug: entry.slug,
      installed: true,
      directory: form.locateDirectory,
      executable: form.locateExePath,
      runner: {
        type: 'proton',
        path: runnerPath,
        prefix: form.locatePrefix || entry.defaultPrefix,
      },
      launch: entry.launch,
      mods: entry.mods,
      ...(
        entry.kind === 'hoyo'
          ? {
              download: buildHoyoDownloadState(
                hoyoVersionState?.downloadMode ?? 'sophon',
                hoyoVersionState?.currentVersion,
                hoyoVersionState?.latestVersion,
                form.locateDirectory,
                hoyoVersionState?.latestVersionLabel,
                hoyoVersionState?.updateChannel,
                hoyoVersionState?.updateSizeBytes,
              ),
            }
          : entry.id === 'wuwa'
            ? {
                download: buildWuwaDownloadState(
                  wuwaVersionState?.currentVersion,
                  wuwaVersionState?.latestVersion,
                  form.locateDirectory,
                ),
              }
            : {}
      ),
    })

    onGameAdded(game)
    reportStatus(`registered ${entry.name.toLowerCase()}`, { type: 'game', gameId: game.id })
  }

  async function handleCatalogStart(entry: CatalogEntry): Promise<void> {
    const form = catalogForms[entry.id]
    const existingGame = findInstalledCatalogGame(games, entry)
    const canUpdate = existingGame?.download?.status === 'update_available'
    const targetDir = canUpdate && existingGame ? existingGame.directory : form.installDir
    const actionLabel = canUpdate ? 'update' : 'install'

    if (!targetDir) {
      reportStatus('install directory required', { type: 'catalog', catalogId: entry.id })
      return
    }

    reportStatus(`starting ${entry.name.toLowerCase()} ${actionLabel}...`, { type: 'catalog', catalogId: entry.id })

    if (entry.kind === 'hoyo') {
      const result = await window.api.invoke('download:start', {
        gameId: entry.id,
        biz: entry.biz!,
        destDir: targetDir,
        useTwintail: true,
        preferVersion: canUpdate ? existingGame?.download?.latestVersion : undefined,
      })
      if (!result.success) {
        reportStatus(`install failed: ${result.error || 'unknown error'}`, { type: 'catalog', catalogId: entry.id })
      }
      return
    }

    if (entry.kind === 'endfield') {
      const result = await window.api.invoke('download:start-endfield', {
        gameId: entry.id,
        destDir: targetDir,
      })
      if (!result.success) {
        reportStatus(`install failed: ${result.error || 'unknown error'}`, { type: 'catalog', catalogId: entry.id })
      }
      return
    }

    const result = await window.api.invoke('download:start-wuwa', {
      gameId: entry.id,
      destDir: targetDir,
    })
    if (!result.success) {
      reportStatus(`install failed: ${result.error || 'unknown error'}`, { type: 'catalog', catalogId: entry.id })
    }
  }

  async function handleCatalogCancel(entry: CatalogEntry): Promise<void> {
    await window.api.invoke('download:cancel', { gameId: entry.id })
    clearDownloadProgress(entry.id)
    reportStatus(`cancelled ${entry.name.toLowerCase()} install`, { type: 'catalog', catalogId: entry.id })
  }

  async function autoAddCatalogGame(entry: CatalogEntry): Promise<void> {
    const runnerPath = runners[0]?.path ?? ''
    const installDir = catalogForms[entry.id].installDir
    const downloadState =
      entry.kind === 'hoyo'
        ? buildHoyoDownloadState(
            'sophon',
            catalogDetails[entry.id].stableVersion ?? catalogDetails[entry.id].version ?? undefined,
            catalogDetails[entry.id].latestVersion ?? catalogDetails[entry.id].version ?? undefined,
            installDir,
            catalogDetails[entry.id].latestVersionLabel ?? catalogDetails[entry.id].versionLabel ?? catalogDetails[entry.id].version ?? undefined,
            catalogDetails[entry.id].updateChannel ?? 'stable',
            undefined,
          )
        : entry.id === 'wuwa'
          ? buildWuwaDownloadState(
              catalogDetails.wuwa.version ?? undefined,
              catalogDetails.wuwa.version ?? undefined,
              installDir,
            )
          : undefined
    const game = await window.api.invoke('game:add', {
      name: entry.name,
      slug: entry.slug,
      installed: true,
      directory: installDir,
      executable: `${installDir}/${entry.executable}`,
      runner: {
        type: 'proton',
        path: runnerPath,
        prefix: entry.defaultPrefix,
      },
      launch: entry.launch,
      mods: entry.mods,
      ...(downloadState ? { download: downloadState } : {}),
    })

    onGameAdded(game)
  }

  return {
    autoAddCatalogGame,
    catalogDetails,
    catalogForms,
    handleCatalogBrowse,
    handleCatalogCancel,
    handleCatalogLocateBrowse,
    handleCatalogLocateConfirm,
    handleCatalogStart,
    loadCatalogDetails,
    refreshSingleHoyoGame,
    refreshSingleWuwaGame,
    setCatalogForms,
    syncCatalogGames,
  }
}
