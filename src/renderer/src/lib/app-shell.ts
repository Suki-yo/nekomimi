import { formatBytes, formatTime } from '@/components/install-modal-utils'
import { CATALOG_ENTRIES, DEFAULT_GENSHIN_FPS_UNLOCK_FPS } from '@/data/catalog'
import type { LaunchPreparationState } from '@/hooks/useGameLaunch'
import type { Selection } from '@/types/app-shell'
import type { DownloadMode, DownloadProgress, GameDownloadState } from '@shared/types/download'
import type { Game, LaunchConfig, ModConfig } from '@shared/types/game'

export interface ManualGameForm {
  name: string
  directory: string
  executable: string
  prefix: string
  runnerPath: string
  detecting: boolean
}

export const GENSHIN_FPS_UNLOCK_OPTIONS = ['off', '60', '90', '120', '144', '165', '200', '240'] as const

export const DEFAULT_LAUNCH: LaunchConfig = {
  env: {},
  preLaunch: [],
  postLaunch: [],
  args: '',
}

export const DEFAULT_MODS: ModConfig = {
  enabled: false,
}

export function createManualGameForm(runnerPath = ''): ManualGameForm {
  return {
    name: '',
    directory: '',
    executable: '',
    prefix: '',
    runnerPath,
    detecting: false,
  }
}

export function isGenshinGame(game: Pick<Game, 'slug' | 'executable'>): boolean {
  return game.slug === 'genshinimpact' || game.executable.split(/[/\\]/).pop() === 'GenshinImpact.exe'
}

export function getGenshinFpsUnlockDraftValue(game: Game): string {
  if (!isGenshinGame(game)) {
    return 'off'
  }

  const fpsUnlock = game.mods.fpsUnlock
  if (fpsUnlock?.enabled === false) {
    return 'off'
  }

  const fps = fpsUnlock?.fps ?? DEFAULT_GENSHIN_FPS_UNLOCK_FPS
  return String(fps)
}

export function createProgressBar(percent: number, width = 18): string {
  const safePercent = Math.max(0, Math.min(100, percent))
  const filled = Math.round((safePercent / 100) * width)
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`
}

export function formatStamp(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

export function isSelectionValid(selection: Selection, games: Game[]): boolean {
  if (selection.type === 'home' || selection.type === 'settings' || selection.type === 'add-game') {
    return true
  }

  if (selection.type === 'catalog') {
    return CATALOG_ENTRIES.some((entry) => entry.id === selection.catalogId)
  }

  return games.some((game) => game.id === selection.gameId)
}

function buildTrackedDownloadState(
  mode: DownloadMode,
  currentVersion: string | undefined,
  latestVersion: string | undefined,
  installPath?: string,
): GameDownloadState {
  return {
    status:
      currentVersion && latestVersion && currentVersion !== latestVersion
        ? 'update_available'
        : 'installed',
    mode,
    currentVersion,
    latestVersion,
    installPath,
  }
}

export function buildHoyoDownloadState(
  mode: 'zip' | 'sophon',
  currentVersion: string | undefined,
  latestVersion: string | undefined,
  installPath?: string,
): GameDownloadState {
  return buildTrackedDownloadState(mode, currentVersion, latestVersion, installPath)
}

export function buildWuwaDownloadState(
  currentVersion: string | undefined,
  latestVersion: string | undefined,
  installPath?: string,
): GameDownloadState {
  return buildTrackedDownloadState('raw', currentVersion, latestVersion, installPath)
}

function fileUrl(path: string): string {
  return `file://${encodeURI(path)}`
}

export function openSystemPath(path: string): void {
  window.open(fileUrl(path), '_blank', 'noopener,noreferrer')
}

export function describeProgress(progress: DownloadProgress): string {
  const left = `${formatBytes(progress.bytesDownloaded)} / ${formatBytes(progress.bytesTotal)}`
  if (progress.status === 'verifying' || progress.status === 'extracting') {
    return `${progress.status.toUpperCase()} ${progress.percent}%`
  }
  const speed = progress.downloadSpeed > 0 ? `${formatBytes(progress.downloadSpeed)}/s` : '--'
  const eta = progress.timeRemaining > 0 ? formatTime(progress.timeRemaining) : '--:--'
  return `${left} @ ${speed} ETA ${eta}`
}

export function placeholderLabel(name: string): string {
  return name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function formatHomeDate(value?: string): string {
  if (!value) {
    return 'never'
  }

  return new Date(value).toLocaleDateString()
}

export function upsertGameList(current: Game[], next: Game): Game[] {
  if (current.some((game) => game.id === next.id)) {
    return current.map((game) => (game.id === next.id ? next : game))
  }
  return [...current, next]
}

export function getTopStatus({
  activeDownload,
  gamesById,
  launchingGameId,
  launchPreparation,
  runnerDownloading,
  runnerProgress,
  steamrtDownloading,
  steamrtProgress,
}: {
  activeDownload: DownloadProgress | null
  gamesById: Record<string, Game>
  launchingGameId: string | null
  launchPreparation: LaunchPreparationState
  runnerDownloading: boolean
  runnerProgress: number
  steamrtDownloading: boolean
  steamrtProgress: number
}): string {
  if (activeDownload) {
    return `[DOWNLOADING ${activeDownload.gameId.toUpperCase()} ${activeDownload.percent}%]`
  }
  if (launchPreparation.active) {
    return `[PREPARING ${launchPreparation.phase.toUpperCase()} ${launchPreparation.progress}%]`
  }
  if (launchingGameId) {
    return `[LAUNCHING ${(gamesById[launchingGameId]?.name ?? 'GAME').toUpperCase()}]`
  }
  if (runnerDownloading) {
    return `[DOWNLOADING RUNNER ${runnerProgress}%]`
  }
  if (steamrtDownloading) {
    return `[INSTALLING STEAMRT ${steamrtProgress}%]`
  }
  return '[IDLE]'
}
