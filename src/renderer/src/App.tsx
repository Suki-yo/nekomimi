import { useEffect, useMemo, useState, type JSX, type KeyboardEvent } from 'react'
import CoverImage from '@/components/CoverImage'
import { formatBytes, formatTime } from '@/components/install-modal-utils'
import { formatPlaytimeHours } from '@/lib/utils'
import { getXXMIImporter } from './utils/mods'
import { APP_NAME, APP_VERSION } from '../../shared/constants'
import type { AppConfig } from '../../shared/types/config'
import type {
  Game,
  LaunchConfig,
  DetectedRunner,
  Mod,
  ModConfig,
} from '../../shared/types/game'
import type { DownloadMode, DownloadProgress, HoyoVersionInfo, WuwaVersionInfo, GameDownloadState } from '../../shared/types/download'

type Selection =
  | { type: 'home' }
  | { type: 'game'; gameId: string }
  | { type: 'mods'; gameId: string }
  | { type: 'config'; gameId: string }
  | { type: 'catalog'; catalogId: CatalogId }
  | { type: 'settings' }
  | { type: 'add-game' }

type CatalogId = 'genshin' | 'starrail' | 'zzz' | 'endfield' | 'wuwa'
type CatalogKind = 'hoyo' | 'endfield' | 'wuwa'
type InstallMode = 'download' | 'locate'
type LaunchPrepPhase = 'xxmi' | 'runner' | 'complete' | 'error'

interface CatalogEntry {
  id: CatalogId
  kind: CatalogKind
  name: string
  vendor: string
  accent: string
  coverLabel: string
  slug: string
  slugHints: string[]
  executable: string
  defaultInstallDir: string
  defaultPrefix: string
  launch: LaunchConfig
  mods: ModConfig
  biz?: 'genshin' | 'starrail' | 'zzz'
}

interface CatalogDetails {
  version: string | null
  sizeLabel: string
  installedSizeLabel?: string
  error: string | null
}

interface CatalogFormState {
  mode: InstallMode
  installDir: string
  locateExePath: string
  locateDirectory: string
  locatePrefix: string
  locateError: string | null
  locating: boolean
}

interface ManualGameForm {
  name: string
  directory: string
  executable: string
  prefix: string
  runnerPath: string
  detecting: boolean
}

interface GameConfigDraft {
  name: string
  runnerPath: string
  prefix: string
  coverImage?: string
  modsEnabled: boolean
  genshinFpsUnlock: string
}

interface LaunchPreparationState {
  active: boolean
  pendingGameId: string | null
  phase: LaunchPrepPhase
  progress: number
  error: string | null
}

interface ActivityEvent {
  id: number
  message: string
  timestamp: string
  selection?: Selection
}

interface SectionState {
  library: boolean
  catalog: boolean
  system: boolean
}

type ModImportMode = 'file' | 'directory'

const EMPTY_MODS: Mod[] = []
const SIDEBAR_MOD_PREVIEW_LIMIT = 4
const GENSHIN_FPS_UNLOCK_OPTIONS = ['off', '60', '90', '120', '144', '165', '200', '240'] as const
const DEFAULT_GENSHIN_FPS_UNLOCK_FPS = 200

const DEFAULT_LAUNCH: LaunchConfig = {
  env: {},
  preLaunch: [],
  postLaunch: [],
  args: '',
}

const DEFAULT_MODS: ModConfig = {
  enabled: false,
}

const CATALOG_ENTRIES: CatalogEntry[] = [
  {
    id: 'genshin',
    kind: 'hoyo',
    name: 'Genshin Impact',
    vendor: 'HoYoverse',
    accent: '#00a0e9',
    coverLabel: 'GI',
    slug: 'genshinimpact',
    slugHints: ['genshin'],
    executable: 'GenshinImpact.exe',
    defaultInstallDir: '~/Games/GenshinImpact',
    defaultPrefix: '~/Games/prefixes/genshinimpact/pfx',
    launch: {
      env: {
        STEAM_COMPAT_CONFIG: 'noxalia',
        WINEDLLOVERRIDES: 'lsteamclient=d;KRSDKExternal.exe=d',
      },
      preLaunch: ['/home/jyq/dev/suki-yo/nekomimi/dev-data/fps_unlock/start-genshin-keqing.sh'],
      postLaunch: [],
      args: '',
    },
    mods: {
      enabled: true,
      importer: 'GIMI',
      fpsUnlock: {
        enabled: true,
        fps: DEFAULT_GENSHIN_FPS_UNLOCK_FPS,
      },
    },
    biz: 'genshin',
  },
  {
    id: 'starrail',
    kind: 'hoyo',
    name: 'Honkai: Star Rail',
    vendor: 'HoYoverse',
    accent: '#6b5ce7',
    coverLabel: 'HSR',
    slug: 'starrail',
    slugHints: ['star-rail', 'starrail', 'star rail'],
    executable: 'StarRail.exe',
    defaultInstallDir: '~/Games/HonkaiStarRail',
    defaultPrefix: '~/Games/prefixes/starrail/pfx',
    launch: {
      env: {
        STEAM_COMPAT_CONFIG: 'noxalia',
        WINEDLLOVERRIDES: 'wintrust=b;dbghelp=n,b',
        STUB_WINTRUST: '1',
        BLOCK_FIRST_REQ: '1',
      },
      preLaunch: [],
      postLaunch: [],
      args: '',
    },
    mods: { enabled: true, importer: 'SRMI' },
    biz: 'starrail',
  },
  {
    id: 'zzz',
    kind: 'hoyo',
    name: 'Zenless Zone Zero',
    vendor: 'HoYoverse',
    accent: '#ff6b35',
    coverLabel: 'ZZZ',
    slug: 'zenlesszonezero',
    slugHints: ['zenless'],
    executable: 'ZenlessZoneZero.exe',
    defaultInstallDir: '~/Games/ZenlessZoneZero',
    defaultPrefix: '~/Games/prefixes/zenlesszonezero/pfx',
    launch: {
      env: {
        STEAM_COMPAT_CONFIG: 'noxalia,gamedrive',
        WINEDLLOVERRIDES: 'lsteamclient=d;KRSDKExternal.exe=d;jsproxy=n,b',
      },
      preLaunch: [],
      postLaunch: [],
      args: '',
    },
    mods: { enabled: true, importer: 'ZZMI' },
    biz: 'zzz',
  },
  {
    id: 'endfield',
    kind: 'endfield',
    name: 'Arknights: Endfield',
    vendor: 'Hypergryph',
    accent: '#00b4cc',
    coverLabel: 'AE',
    slug: 'endfield',
    slugHints: ['endfield'],
    executable: 'Endfield.exe',
    defaultInstallDir: '~/Games/Endfield',
    defaultPrefix: '~/Games/prefixes/endfield/pfx',
    launch: {
      env: {
        STEAM_COMPAT_CONFIG: 'noxalia',
        WINEDLLOVERRIDES: 'lsteamclient=d;KRSDKExternal.exe=d',
      },
      preLaunch: [],
      postLaunch: [],
      args: '-force-d3d11',
    },
    mods: { enabled: true, importer: 'EFMI' },
  },
  {
    id: 'wuwa',
    kind: 'wuwa',
    name: 'Wuthering Waves',
    vendor: 'Kuro Games',
    accent: '#3d7ebf',
    coverLabel: 'WW',
    slug: 'wuwa',
    slugHints: ['wuwa', 'wuthering'],
    executable: 'Client/Binaries/Win64/Client-Win64-Shipping.exe',
    defaultInstallDir: '~/Games/WutheringWaves',
    defaultPrefix: '~/Games/prefixes/wuwa/pfx',
    launch: {
      env: {
        STEAM_COMPAT_CONFIG: 'noopwr,noxalia',
      },
      preLaunch: [],
      postLaunch: [],
      args: '',
    },
    mods: { enabled: false, importer: 'WWMI' },
  },
]

const INITIAL_SELECTION: Selection = { type: 'home' }
const INITIAL_SECTIONS: SectionState = { library: true, catalog: true, system: true }

function createCatalogForm(entry: CatalogEntry): CatalogFormState {
  return {
    mode: 'download',
    installDir: entry.defaultInstallDir,
    locateExePath: '',
    locateDirectory: '',
    locatePrefix: entry.defaultPrefix,
    locateError: null,
    locating: false,
  }
}

function getParentDirectory(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index === -1 ? filePath : normalized.slice(0, index)
}

function isGenshinGame(game: Pick<Game, 'slug' | 'executable'>): boolean {
  return game.slug === 'genshinimpact' || game.executable.split(/[/\\]/).pop() === 'GenshinImpact.exe'
}

function getGenshinFpsUnlockDraftValue(game: Game): string {
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

function createProgressBar(percent: number, width = 18): string {
  const safePercent = Math.max(0, Math.min(100, percent))
  const filled = Math.round((safePercent / 100) * width)
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`
}

function formatStamp(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function isSelectionValid(selection: Selection, games: Game[]): boolean {
  if (selection.type === 'home' || selection.type === 'settings' || selection.type === 'add-game') {
    return true
  }

  if (selection.type === 'catalog') {
    return CATALOG_ENTRIES.some((entry) => entry.id === selection.catalogId)
  }

  return games.some((game) => game.id === selection.gameId)
}

function getGameImporter(game: Game): string | null {
  return game.mods.importer ?? getXXMIImporter(game.executable)
}

function findCatalogEntryForGame(game: Game): CatalogEntry | undefined {
  return CATALOG_ENTRIES.find((entry) =>
    entry.slugHints.some((hint) => game.slug.toLowerCase().includes(hint) || game.name.toLowerCase().includes(hint)),
  )
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

function buildHoyoDownloadState(
  mode: 'zip' | 'sophon',
  currentVersion: string | undefined,
  latestVersion: string | undefined,
  installPath?: string,
): GameDownloadState {
  return buildTrackedDownloadState(mode, currentVersion, latestVersion, installPath)
}

function buildWuwaDownloadState(
  currentVersion: string | undefined,
  latestVersion: string | undefined,
  installPath?: string,
): GameDownloadState {
  return buildTrackedDownloadState('raw', currentVersion, latestVersion, installPath)
}

function fileUrl(path: string): string {
  return `file://${encodeURI(path)}`
}

function openSystemPath(path: string): void {
  window.open(fileUrl(path), '_blank', 'noopener,noreferrer')
}

function describeProgress(progress: DownloadProgress): string {
  const left = `${formatBytes(progress.bytesDownloaded)} / ${formatBytes(progress.bytesTotal)}`
  if (progress.status === 'verifying' || progress.status === 'extracting') {
    return `${progress.status.toUpperCase()} ${progress.percent}%`
  }
  const speed = progress.downloadSpeed > 0 ? `${formatBytes(progress.downloadSpeed)}/s` : '--'
  const eta = progress.timeRemaining > 0 ? formatTime(progress.timeRemaining) : '--:--'
  return `${left} @ ${speed} ETA ${eta}`
}

function getInstallStatus(
  entry: CatalogEntry,
  progress: DownloadProgress | null,
  installed: boolean,
  installedGame?: Game,
): string {
  if (progress && ['downloading', 'verifying', 'extracting'].includes(progress.status)) {
    return `[${progress.percent}%]`
  }
  if (installedGame?.download?.status === 'update_available') {
    return '[UPDATE]'
  }
  if (installed) {
    return '[INSTALLED]'
  }
  return '[READY]'
}

function placeholderLabel(name: string): string {
  return name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function formatHomeDate(value?: string): string {
  if (!value) {
    return 'never'
  }

  return new Date(value).toLocaleDateString()
}

function formatHomeTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function upsertGameList(current: Game[], next: Game): Game[] {
  if (current.some((game) => game.id === next.id)) {
    return current.map((game) => (game.id === next.id ? next : game))
  }
  return [...current, next]
}

function App(): JSX.Element {
  const [games, setGames] = useState<Game[]>([])
  const [gamesLoading, setGamesLoading] = useState(true)
  const [gamesError, setGamesError] = useState<string | null>(null)
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [runners, setRunners] = useState<DetectedRunner[]>([])
  const [selectedNode, setSelectedNode] = useState<Selection>(INITIAL_SELECTION)
  const [expandedGames, setExpandedGames] = useState<Record<string, boolean>>({})
  const [sections, setSections] = useState<SectionState>(INITIAL_SECTIONS)
  const [modsByGame, setModsByGame] = useState<Record<string, Mod[]>>({})
  const [runningGames, setRunningGames] = useState<Set<string>>(new Set())
  const [runningGameStarts, setRunningGameStarts] = useState<Record<string, number>>({})
  const [statusLine, setStatusLine] = useState('> awaiting input...')
  const [launchingGameId, setLaunchingGameId] = useState<string | null>(null)
  const [launchStatus, setLaunchStatus] = useState<string | null>(null)
  const [clock, setClock] = useState(new Date())
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
  const [downloadProgresses, setDownloadProgresses] = useState<Record<string, DownloadProgress>>({})
  const [launchPreparation, setLaunchPreparation] = useState<LaunchPreparationState>({
    active: false,
    pendingGameId: null,
    phase: 'xxmi',
    progress: 0,
    error: null,
  })
  const [manualGameForm, setManualGameForm] = useState<ManualGameForm>({
    name: '',
    directory: '',
    executable: '',
    prefix: '',
    runnerPath: '',
    detecting: false,
  })
  const [configDraft, setConfigDraft] = useState<GameConfigDraft | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)
  const [editingModPath, setEditingModPath] = useState<string | null>(null)
  const [editingModName, setEditingModName] = useState('')
  const [modImportMenuGameId, setModImportMenuGameId] = useState<string | null>(null)
  const [runnerDownloading, setRunnerDownloading] = useState(false)
  const [runnerProgress, setRunnerProgress] = useState(0)
  const [runnerError, setRunnerError] = useState<string | null>(null)
  const [installedRunner, setInstalledRunner] = useState<{ name: string; path: string; wine: string } | null>(null)
  const [steamrtStatus, setSteamrtStatus] = useState<{ installed: boolean; path: string | null } | null>(null)
  const [steamrtDownloading, setSteamrtDownloading] = useState(false)
  const [steamrtProgress, setSteamrtProgress] = useState(0)
  const [steamrtError, setSteamrtError] = useState<string | null>(null)
  const [activityLog, setActivityLog] = useState<ActivityEvent[]>([])

  const gamesById = useMemo(
    () => Object.fromEntries(games.map((game) => [game.id, game])) as Record<string, Game>,
    [games],
  )

  const selectedGame = useMemo(() => {
    if (selectedNode.type === 'game' || selectedNode.type === 'mods' || selectedNode.type === 'config') {
      return gamesById[selectedNode.gameId] ?? null
    }
    return null
  }, [gamesById, selectedNode])

  const selectedCatalog = useMemo(() => {
    if (selectedNode.type !== 'catalog') {
      return null
    }
    return CATALOG_ENTRIES.find((entry) => entry.id === selectedNode.catalogId) ?? null
  }, [selectedNode])

  const selectedMods = selectedGame ? modsByGame[selectedGame.id] ?? EMPTY_MODS : EMPTY_MODS

  const activeDownload = useMemo(
    () =>
      Object.values(downloadProgresses).find((progress) =>
        ['downloading', 'verifying', 'extracting'].includes(progress.status),
      ) ?? null,
    [downloadProgresses],
  )

  const continueGame = useMemo(() => {
    if (games.length === 0) {
      return null
    }

    const activeGames = games.filter((game) => runningGames.has(game.id))
    if (activeGames.length > 0) {
      return [...activeGames].sort(
        (left, right) => (runningGameStarts[right.id] ?? 0) - (runningGameStarts[left.id] ?? 0),
      )[0] ?? null
    }

    const playedGames = games.filter((game) => game.lastPlayed)
    if (playedGames.length === 0) {
      return games[0] ?? null
    }

    return [...playedGames].sort((left, right) =>
      new Date(right.lastPlayed!).getTime() - new Date(left.lastPlayed!).getTime(),
    )[0] ?? null
  }, [games, runningGameStarts, runningGames])

  const quickPicks = useMemo(
    () =>
      [...games]
        .sort((left, right) => {
          const leftPlayed = left.lastPlayed ? new Date(left.lastPlayed).getTime() : 0
          const rightPlayed = right.lastPlayed ? new Date(right.lastPlayed).getTime() : 0
          if (leftPlayed !== rightPlayed) {
            return rightPlayed - leftPlayed
          }
          return right.playtime - left.playtime
        })
        .slice(0, 3),
    [games],
  )

  const activeGameState = selectedGame
    ? runningGames.has(selectedGame.id)
      ? 'RUNNING'
      : launchPreparation.pendingGameId === selectedGame.id
        ? 'PREPARING'
        : 'IDLE'
    : selectedCatalog && activeDownload?.gameId === selectedCatalog.id
      ? activeDownload.status.toUpperCase()
      : 'IDLE'

  useEffect(() => {
    void loadInitialState()
    void loadCatalogDetails()
  }, [])

  useEffect(() => {
    setModImportMenuGameId(null)
  }, [selectedNode])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClock(new Date())
    }, 1000)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const pollRunning = async () => {
      const running = await window.api.invoke('game:running')
      setRunningGames(new Set(running.map((game) => game.id)))
      setRunningGameStarts(
        Object.fromEntries(running.map((game) => [game.id, game.startTime])) as Record<string, number>,
      )
    }

    void pollRunning()
    const interval = window.setInterval(() => {
      void pollRunning()
    }, 3000)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!isSelectionValid(selectedNode, games)) {
      setSelectedNode({ type: 'home' })
    }

    setExpandedGames((current) => {
      const next = { ...current }
      for (const game of games) {
        if (next[game.id] === undefined) {
          next[game.id] = false
        }
      }
      return next
    })
  }, [games, selectedNode])

  useEffect(() => {
    if (!selectedGame) {
      setConfigDraft(null)
      return
    }

    setConfigDraft({
      name: selectedGame.name,
      runnerPath: selectedGame.runner.path,
      prefix: selectedGame.runner.prefix,
      coverImage: selectedGame.coverImage,
      modsEnabled: selectedGame.mods.enabled,
      genshinFpsUnlock: getGenshinFpsUnlockDraftValue(selectedGame),
    })
  }, [selectedGame])

  useEffect(() => {
    const targets = games.filter((game) => {
      const selected = selectedNode.type === 'game' || selectedNode.type === 'mods' || selectedNode.type === 'config'
        ? selectedNode.gameId === game.id
        : false
      return expandedGames[game.id] || selected
    })

    for (const game of targets) {
      void ensureModsLoaded(game)
    }
  }, [expandedGames, games, selectedNode])

  useEffect(() => {
    const unsubDownloadProgress = window.api.on('download:progress', (data) => {
      const progress = data as DownloadProgress
      setDownloadProgresses((current) => ({ ...current, [progress.gameId]: progress }))
      setStatusLine(`> ${progress.gameId} ${progress.status} ${progress.percent}%`)
    })

    const unsubDownloadComplete = window.api.on('download:complete', (data) => {
      const { gameId } = data as { gameId: string }
      reportStatus(`${gameId} installation complete`, { type: 'catalog', catalogId: gameId as CatalogId })
      setDownloadProgresses((current) => {
        const existing = current[gameId]
        if (!existing) {
          return current
        }
        return {
          ...current,
          [gameId]: { ...existing, percent: 100, status: 'installed' },
        }
      })
      const entry = CATALOG_ENTRIES.find((item) => item.id === gameId)
      if (entry) {
        const existingGame = games.find((game) =>
          entry.slugHints.some((hint) => game.slug.toLowerCase().includes(hint) || game.name.toLowerCase().includes(hint)),
        )

        if (entry.kind === 'hoyo' && existingGame) {
          void refreshSingleHoyoGame(existingGame)
        } else if (entry.id === 'wuwa' && existingGame) {
          void refreshSingleWuwaGame(existingGame)
        } else {
          void autoAddCatalogGame(entry)
        }
      }
    })

    const unsubDownloadError = window.api.on('download:error', (data) => {
      const { gameId, error } = data as { gameId: string; error: string }
      reportStatus(`${gameId} failed: ${error}`, { type: 'catalog', catalogId: gameId as CatalogId })
      setDownloadProgresses((current) => {
        const existing = current[gameId]
        if (!existing) {
          return current
        }
        return {
          ...current,
          [gameId]: { ...existing, status: 'error', error },
        }
      })
    })

    const unsubLaunchProgress = window.api.on('game:launch-progress', (data) => {
      const payload = data as { step: string; percent: number }
      const text = `${payload.step} (${payload.percent}%)`
      setLaunchStatus(text)
      setStatusLine(`> ${text.toLowerCase()}`)
    })

    const unsubRunner = window.api.on('mods:runner-progress', (percent) => {
      const value = percent as number
      setRunnerProgress(value)
      setLaunchPreparation((current) =>
        current.active && current.phase === 'runner'
          ? { ...current, progress: value }
          : current,
      )
    })

    const unsubXXMI = window.api.on('mods:xxmi-progress', (percent) => {
      const value = percent as number
      setLaunchPreparation((current) =>
        current.active && current.phase === 'xxmi'
          ? { ...current, progress: value }
          : current,
      )
    })

    const unsubSteamrt = window.api.on('steamrt:progress', (percent) => {
      setSteamrtProgress(percent as number)
    })

    const unsubModsChanged = window.api.on('mods:changed', (data) => {
      const { importer } = data as { importer: string }
      const matchingGames = games.filter((game) => getGameImporter(game) === importer)

      for (const game of matchingGames) {
        void refreshMods(game)
      }
    })

    return () => {
      unsubDownloadProgress()
      unsubDownloadComplete()
      unsubDownloadError()
      unsubLaunchProgress()
      unsubRunner()
      unsubXXMI()
      unsubSteamrt()
      unsubModsChanged()
    }
  }, [catalogForms, games, runners])

  async function loadInitialState(): Promise<void> {
    await Promise.all([
      loadGames(),
      loadConfig(),
      loadRunners(),
      loadRunnerInfo(),
      loadSteamRuntimeStatus(),
    ])
  }

  async function loadGames(): Promise<void> {
    try {
      setGamesLoading(true)
      const nextGames = await window.api.invoke('game:list')
      const syncedGames = await syncCatalogGames(nextGames)
      setGames(syncedGames)
      setGamesError(null)
    } catch (error) {
      setGamesError(error instanceof Error ? error.message : 'Failed to load games')
    } finally {
      setGamesLoading(false)
    }
  }

  async function loadConfig(): Promise<void> {
    try {
      setConfigLoading(true)
      const nextConfig = await window.api.invoke('config:get')
      setConfig(nextConfig)
    } finally {
      setConfigLoading(false)
    }
  }

  async function loadRunners(): Promise<void> {
    const nextRunners = await window.api.invoke('runner:list')
    setRunners(nextRunners)
    setManualGameForm((current) => ({
      ...current,
      runnerPath: current.runnerPath || nextRunners[0]?.path || '',
    }))
  }

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
          result.latestVersion ?? info?.version ?? game.download?.latestVersion
        const nextMode =
          result.downloadMode
          ?? info?.downloadMode
          ?? (game.download?.mode === 'zip' || game.download?.mode === 'sophon' ? game.download.mode : 'sophon')

        if (!nextCurrentVersion && !nextLatestVersion) {
          return game
        }

        const nextDownload = buildHoyoDownloadState(
          nextMode,
          nextCurrentVersion,
          nextLatestVersion,
          game.directory,
        )

        const unchanged =
          game.download?.status === nextDownload.status
          && game.download?.mode === nextDownload.mode
          && game.download?.currentVersion === nextDownload.currentVersion
          && game.download?.latestVersion === nextDownload.latestVersion
          && game.download?.installPath === nextDownload.installPath

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
          game.download?.status === nextDownload.status
          && game.download?.mode === nextDownload.mode
          && game.download?.currentVersion === nextDownload.currentVersion
          && game.download?.latestVersion === nextDownload.latestVersion
          && game.download?.installPath === nextDownload.installPath

        if (unchanged) {
          return game
        }

        const updated = await updateGame(game.id, { download: nextDownload })
        return updated
      }),
    )

    return nextGames.map((game) => updates.find((candidate) => candidate.id === game.id) ?? game)
  }

  async function refreshSingleHoyoGame(game: Game): Promise<Game> {
    const entry = findCatalogEntryForGame(game)
    if (entry?.kind !== 'hoyo' || !entry.biz) {
      return game
    }

    const result = await window.api.invoke('download:check-updates', {
      biz: entry.biz,
      currentVersion: game.download?.currentVersion ?? game.update?.currentVersion,
      installDir: game.directory,
    })

    const nextCurrentVersion =
      result.currentVersion
      ?? result.latestVersion
      ?? game.download?.currentVersion
      ?? game.update?.currentVersion
    const nextLatestVersion = result.latestVersion ?? game.download?.latestVersion
    const nextMode =
      result.downloadMode
      ?? (game.download?.mode === 'zip' || game.download?.mode === 'sophon' ? game.download.mode : 'sophon')

    const nextDownload = buildHoyoDownloadState(
      nextMode,
      nextCurrentVersion,
      nextLatestVersion,
      game.directory,
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

  async function loadRunnerInfo(): Promise<void> {
    const info = await window.api.invoke('mods:runner-info')
    setInstalledRunner(info)
  }

  async function loadSteamRuntimeStatus(): Promise<void> {
    const status = await window.api.invoke('steamrt:status')
    setSteamrtStatus(status)
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
        nextDetails[entry.id] = {
          version: info.version,
          sizeLabel: info.zipSize ? formatBytes(info.zipSize) : 'official manifest',
          error: null,
        }
      } else {
        const reason = result.status === 'rejected' ? result.reason : 'Version unavailable'
        nextDetails[entry.id] = {
          version: null,
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

  async function ensureModsLoaded(game: Game): Promise<void> {
    if (modsByGame[game.id] !== undefined) {
      return
    }

    const importer = getGameImporter(game)
    if (!importer) {
      setModsByGame((current) => ({ ...current, [game.id]: EMPTY_MODS }))
      return
    }

    try {
      const mods = await window.api.invoke('mods:list', { importer })
      setModsByGame((current) => ({ ...current, [game.id]: mods }))
    } catch {
      setModsByGame((current) => ({ ...current, [game.id]: EMPTY_MODS }))
    }
  }

  async function refreshMods(game: Game): Promise<void> {
    const importer = getGameImporter(game)
    if (!importer) {
      setModsByGame((current) => ({ ...current, [game.id]: EMPTY_MODS }))
      return
    }

    const mods = await window.api.invoke('mods:list', { importer })
    setModsByGame((current) => ({ ...current, [game.id]: mods }))
  }

  async function updateGame(gameId: string, updates: Partial<Game>): Promise<Game> {
    const updated = await window.api.invoke('game:update', { id: gameId, updates })
    setGames((current) => current.map((game) => (game.id === gameId ? updated : game)))
    return updated
  }

  function pushActivity(message: string, selection?: Selection): void {
    setActivityLog((current) => [
      {
        id: Date.now() + current.length,
        message,
        timestamp: new Date().toISOString(),
        selection,
      },
      ...current,
    ].slice(0, 12))
  }

  function reportStatus(message: string, activitySelection?: Selection): void {
    const normalized = message.startsWith('>') ? message : `> ${message}`
    setStatusLine(normalized)
    pushActivity(normalized.replace(/^>\s*/, ''), activitySelection)
  }

  async function handleLaunchGame(game: Game): Promise<void> {
    if (runningGames.has(game.id)) {
      reportStatus(`${game.name.toLowerCase()} is already running`, { type: 'game', gameId: game.id })
      return
    }

    const status = await window.api.invoke('mods:xxmi-status', undefined)
    if (!status.xxmiInstalled || !status.runnerInstalled) {
      setLaunchPreparation({
        active: true,
        pendingGameId: game.id,
        phase: !status.xxmiInstalled ? 'xxmi' : 'runner',
        progress: 0,
        error: null,
      })

      if (!status.xxmiInstalled) {
        reportStatus('downloading xxmi prerequisites...', { type: 'game', gameId: game.id })
        const xxmiResult = await window.api.invoke('mods:xxmi-download')
        if (!xxmiResult.success) {
          setLaunchPreparation({
            active: true,
            pendingGameId: game.id,
            phase: 'error',
            progress: 0,
            error: xxmiResult.error || 'XXMI download failed',
          })
          reportStatus(`xxmi failed: ${xxmiResult.error || 'download failed'}`, { type: 'game', gameId: game.id })
          return
        }
      }

      if (!status.runnerInstalled) {
        setLaunchPreparation((current) => ({ ...current, phase: 'runner', progress: 0 }))
        reportStatus('downloading proton-ge prerequisite...', { type: 'game', gameId: game.id })
        const runnerResult = await window.api.invoke('mods:runner-download')
        if (!runnerResult.success) {
          setLaunchPreparation({
            active: true,
            pendingGameId: game.id,
            phase: 'error',
            progress: 0,
            error: runnerResult.error || 'Runner download failed',
          })
          reportStatus(`runner failed: ${runnerResult.error || 'download failed'}`, { type: 'game', gameId: game.id })
          return
        }
        await loadRunnerInfo()
      }

      setLaunchPreparation({
        active: false,
        pendingGameId: null,
        phase: 'complete',
        progress: 100,
        error: null,
      })
    }

    setLaunchingGameId(game.id)
    reportStatus(`launching ${game.name.toLowerCase()}...`, { type: 'game', gameId: game.id })
    const result = await window.api.invoke('game:launch', { id: game.id })
    setLaunchingGameId(null)
    setLaunchStatus(null)

    if (!result.success) {
      reportStatus(`launch failed: ${result.error || 'unknown error'}`, { type: 'game', gameId: game.id })
      return
    }

    reportStatus(`${game.name.toLowerCase()} launched`, { type: 'game', gameId: game.id })
  }

  async function handleDeleteGame(game: Game): Promise<void> {
    if (!window.confirm(`Delete "${game.name}" from the library?`)) {
      return
    }

    await window.api.invoke('game:delete', { id: game.id })
    setGames((current) => current.filter((item) => item.id !== game.id))
    setSelectedNode(games.length > 1 ? { type: 'game', gameId: games.find((item) => item.id !== game.id)?.id ?? '' } : { type: 'catalog', catalogId: 'genshin' })
    reportStatus(`removed ${game.name.toLowerCase()} from library`)
  }

  async function handleBrowseManualExecutable(): Promise<void> {
    try {
      setManualGameForm((current) => ({ ...current, detecting: true }))
      const filePath = await window.api.openFile()
      if (!filePath) {
        return
      }

      const detected = await window.api.invoke('game:detect', { exePath: filePath })
      setManualGameForm((current) => ({
        ...current,
        name: detected.name,
        directory: detected.directory,
        executable: filePath,
        prefix: detected.prefix ?? current.prefix,
      }))
      reportStatus(`detected ${detected.name.toLowerCase()}`)
    } catch (error) {
      reportStatus(`detection failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    } finally {
      setManualGameForm((current) => ({ ...current, detecting: false }))
    }
  }

  async function handleAddManualGame(): Promise<void> {
    if (!manualGameForm.name || !manualGameForm.directory || !manualGameForm.executable) {
      reportStatus('missing executable, name, or directory')
      return
    }

    const selectedRunner = runners.find((runner) => runner.path === manualGameForm.runnerPath)
    const game = await window.api.invoke('game:add', {
      name: manualGameForm.name,
      slug: manualGameForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      installed: true,
      directory: manualGameForm.directory,
      executable: manualGameForm.executable,
      runner: {
        type: selectedRunner?.type ?? 'proton',
        path: manualGameForm.runnerPath,
        prefix: manualGameForm.prefix,
      },
      launch: DEFAULT_LAUNCH,
      mods: DEFAULT_MODS,
    })

    setGames((current) => upsertGameList(current, game))
    setSelectedNode({ type: 'game', gameId: game.id })
    setExpandedGames((current) => ({ ...current, [game.id]: true }))
    setManualGameForm({
      name: '',
      directory: '',
      executable: '',
      prefix: '',
      runnerPath: runners[0]?.path ?? '',
      detecting: false,
    })
    reportStatus(`added ${game.name.toLowerCase()} to library`, { type: 'game', gameId: game.id })
  }

  function handleSelectGame(selection: Selection): void {
    setSelectedNode(selection)
    if (selection.type === 'game' || selection.type === 'mods' || selection.type === 'config') {
      setExpandedGames((current) => ({ ...current, [selection.gameId]: true }))
    }
  }

  function handleGameLabelClick(gameId: string): void {
    const isCurrentGame =
      (selectedNode.type === 'game' || selectedNode.type === 'mods' || selectedNode.type === 'config') &&
      selectedNode.gameId === gameId

    if (!isCurrentGame) {
      handleSelectGame({ type: 'game', gameId })
      return
    }

    setExpandedGames((current) => ({ ...current, [gameId]: !current[gameId] }))
  }

  function handleToggleGameExpanded(gameId: string): void {
    setExpandedGames((current) => ({ ...current, [gameId]: !current[gameId] }))
  }

  function handleToggleSection(section: keyof SectionState): void {
    setSections((current) => ({ ...current, [section]: !current[section] }))
  }

  async function handleToggleMod(game: Game, mod: Mod): Promise<void> {
    await window.api.invoke('mods:toggle', { modPath: mod.path, enabled: !mod.enabled })
    setModsByGame((current) => ({
      ...current,
      [game.id]: (current[game.id] ?? EMPTY_MODS).map((item) =>
        item.path === mod.path ? { ...item, enabled: !item.enabled } : item,
      ),
    }))
    reportStatus(`${mod.name.toLowerCase()} ${mod.enabled ? 'disabled' : 'enabled'}`, { type: 'mods', gameId: game.id })
  }

  async function handleEnableAllMods(game: Game, enabled: boolean): Promise<void> {
    const importer = getGameImporter(game)
    if (!importer) {
      return
    }

    if (enabled) {
      await window.api.invoke('mods:enable-all', { importer })
      reportStatus(`enabled all mods for ${game.name.toLowerCase()}`, { type: 'mods', gameId: game.id })
    } else {
      await window.api.invoke('mods:disable-all', { importer })
      reportStatus(`disabled all mods for ${game.name.toLowerCase()}`, { type: 'mods', gameId: game.id })
    }
    await refreshMods(game)
  }

  async function handleOpenModsFolder(importer: string): Promise<void> {
    const result = await window.api.invoke('mods:open-folder', { importer })
    if (result.success) {
      reportStatus(`opened ${importer.toLowerCase()} mods folder`)
      return
    }

    reportStatus(`failed to open mods folder: ${result.error || 'unknown error'}`)
  }

  async function handleRenameMod(game: Game, mod: Mod): Promise<void> {
    if (!editingModName.trim() || editingModName.trim() === mod.name) {
      setEditingModPath(null)
      setEditingModName('')
      return
    }

    const result = await window.api.invoke('mods:rename', {
      modPath: mod.path,
      customName: editingModName.trim(),
    })

    if (result.success) {
      await refreshMods(game)
      reportStatus(`renamed mod to ${editingModName.trim().toLowerCase()}`, { type: 'mods', gameId: game.id })
    } else {
      reportStatus(`rename failed: ${result.error || 'unknown error'}`)
    }

    setEditingModPath(null)
    setEditingModName('')
  }

  async function handleAddMod(game: Game, mode: ModImportMode): Promise<void> {
    const importer = getGameImporter(game)
    if (!importer) {
      reportStatus('mods are not supported for this title')
      return
    }

    try {
      setModImportMenuGameId(null)
      const selectedSource = await window.api.invoke('dialog:openModSource', {
        defaultPath: game.directory,
        mode,
      })
      if (!selectedSource) {
        return
      }

      const result = await window.api.invoke('mods:install', { importer, sourcePath: selectedSource.path })
      if (result.success) {
        await refreshMods(game)
        reportStatus(`added mod from ${selectedSource.path.split(/[/\\]/).pop()?.toLowerCase() ?? 'selection'}`, { type: 'mods', gameId: game.id })
      } else {
        reportStatus(`add mod failed: ${result.error || 'unknown error'}`)
      }
    } catch (error) {
      reportStatus(`add mod failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  async function handleChangeCoverImage(): Promise<void> {
    if (!selectedGame || !configDraft) {
      return
    }

    const imagePath = await window.api.openImage(selectedGame.directory)
    if (!imagePath) {
      return
    }

    setConfigDraft({ ...configDraft, coverImage: imagePath })
    reportStatus('cover image updated in draft', { type: 'config', gameId: selectedGame.id })
  }

  async function handleSaveConfig(): Promise<void> {
    if (!selectedGame || !configDraft) {
      return
    }

    setSavingConfig(true)
    try {
      const runner = runners.find((item) => item.path === configDraft.runnerPath)
      const fpsUnlock =
        isGenshinGame(selectedGame)
          ? {
              enabled: configDraft.genshinFpsUnlock !== 'off',
              fps:
                configDraft.genshinFpsUnlock === 'off'
                  ? selectedGame.mods.fpsUnlock?.fps ?? DEFAULT_GENSHIN_FPS_UNLOCK_FPS
                  : Number(configDraft.genshinFpsUnlock),
            }
          : selectedGame.mods.fpsUnlock
      const updated = await updateGame(selectedGame.id, {
        name: configDraft.name,
        coverImage: configDraft.coverImage,
        runner: {
          ...selectedGame.runner,
          type: runner?.type ?? selectedGame.runner.type,
          path: configDraft.runnerPath,
          prefix: configDraft.prefix,
        },
        mods: {
          ...selectedGame.mods,
          enabled: configDraft.modsEnabled,
          importer: getGameImporter(selectedGame) ?? undefined,
          fpsUnlock,
        },
      })
      setConfigDraft({
        name: updated.name,
        runnerPath: updated.runner.path,
        prefix: updated.runner.prefix,
        coverImage: updated.coverImage,
        modsEnabled: updated.mods.enabled,
        genshinFpsUnlock: getGenshinFpsUnlockDraftValue(updated),
      })
      reportStatus(`saved config for ${updated.name.toLowerCase()}`, { type: 'config', gameId: updated.id })
    } finally {
      setSavingConfig(false)
    }
  }

  async function handleUpdateConfig<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void> {
    if (!config) {
      return
    }

    const updated = await window.api.invoke('config:update', { [key]: value } as Partial<AppConfig>)
    setConfig(updated)
    reportStatus(`updated ${String(key)} settings`, { type: 'settings' })
  }

  async function handleRunnerDownload(): Promise<void> {
    setRunnerDownloading(true)
    setRunnerProgress(0)
    setRunnerError(null)
    reportStatus('downloading proton-ge...', { type: 'settings' })
    const result = await window.api.invoke('mods:runner-download')
    if (result.success) {
      await loadRunnerInfo()
      reportStatus('proton-ge ready', { type: 'settings' })
    } else {
      setRunnerError(result.error || 'Download failed')
      reportStatus(`proton-ge failed: ${result.error || 'download failed'}`, { type: 'settings' })
    }
    setRunnerDownloading(false)
  }

  async function handleSteamRuntimeInstall(): Promise<void> {
    setSteamrtDownloading(true)
    setSteamrtProgress(0)
    setSteamrtError(null)
    reportStatus('installing steam runtime...', { type: 'settings' })
    const result = await window.api.invoke('steamrt:install')
    if (result.success) {
      await loadSteamRuntimeStatus()
      reportStatus('steam runtime ready', { type: 'settings' })
    } else {
      setSteamrtError(result.error || 'Download failed')
      reportStatus(`steam runtime failed: ${result.error || 'download failed'}`, { type: 'settings' })
    }
    setSteamrtDownloading(false)
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

    setGames((current) => upsertGameList(current, game))
    setSelectedNode({ type: 'game', gameId: game.id })
    setExpandedGames((current) => ({ ...current, [game.id]: true }))
    reportStatus(`registered ${entry.name.toLowerCase()}`, { type: 'game', gameId: game.id })
  }

  async function handleCatalogStart(entry: CatalogEntry): Promise<void> {
    const form = catalogForms[entry.id]
    const existingGame = games.find((game) =>
      entry.slugHints.some((hint) => game.slug.toLowerCase().includes(hint) || game.name.toLowerCase().includes(hint)),
    )
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
    setDownloadProgresses((current) => {
      const next = { ...current }
      delete next[entry.id]
      return next
    })
    reportStatus(`cancelled ${entry.name.toLowerCase()} install`, { type: 'catalog', catalogId: entry.id })
  }

  async function autoAddCatalogGame(entry: CatalogEntry): Promise<void> {
    const runnerPath = runners[0]?.path ?? ''
    const installDir = catalogForms[entry.id].installDir
    const downloadState =
      entry.kind === 'hoyo'
        ? buildHoyoDownloadState(
            'sophon',
            catalogDetails[entry.id].version ?? undefined,
            catalogDetails[entry.id].version ?? undefined,
            installDir,
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

    setGames((current) => upsertGameList(current, game))
    setExpandedGames((current) => ({ ...current, [game.id]: true }))
    setSelectedNode({ type: 'game', gameId: game.id })
  }

  function isCatalogInstalled(entry: CatalogEntry): boolean {
    return games.some((game) =>
      entry.slugHints.some((hint) => game.slug.toLowerCase().includes(hint) || game.name.toLowerCase().includes(hint)),
    )
  }

  function renderTree(): JSX.Element {
    return (
      <div className="tui-tree">
        <div className="tui-tree-block">
          <button
            className={`tui-tree-row ${selectedNode.type === 'home' ? 'is-active' : ''}`}
            onClick={() => setSelectedNode({ type: 'home' })}
            type="button"
          >
            <span className="tui-tree-prefix">├──</span>
            <span className="tui-tree-label">home</span>
          </button>
        </div>

        <button className="tui-section-title" onClick={() => handleToggleSection('library')} type="button">
          {sections.library ? '[-]' : '[+]'} LIBRARY
        </button>
        {sections.library && (
          <div className="tui-tree-block">
            {games.map((game) => {
              const importer = getGameImporter(game)
              const mods = modsByGame[game.id] ?? EMPTY_MODS
              const visibleMods = mods.slice(0, SIDEBAR_MOD_PREVIEW_LIMIT)
              const hasHiddenMods = mods.length > SIDEBAR_MOD_PREVIEW_LIMIT
              const running = runningGames.has(game.id)
              const active =
                (selectedNode.type === 'game' || selectedNode.type === 'mods' || selectedNode.type === 'config') &&
                selectedNode.gameId === game.id
              return (
                <div key={game.id} className="tui-tree-group">
                  <div className={`tui-tree-row ${active && selectedNode.type === 'game' ? 'is-active' : ''}`}>
                    <button
                      className="tui-tree-toggle"
                      onClick={() => handleToggleGameExpanded(game.id)}
                      type="button"
                    >
                      {expandedGames[game.id] ? '[▼]' : '[▶]'}
                    </button>
                    <button
                      className="tui-tree-label"
                      onClick={() => handleGameLabelClick(game.id)}
                      type="button"
                    >
                      {game.name}
                    </button>
                    <span className="tui-inline-status">
                      {running ? '[RUNNING]' : ''}
                    </span>
                  </div>

                  {expandedGames[game.id] && (
                    <div className="tui-tree-children">
                      <button
                        className={`tui-tree-row ${selectedNode.type === 'mods' && selectedNode.gameId === game.id ? 'is-active' : ''}`}
                        onClick={() => handleSelectGame({ type: 'mods', gameId: game.id })}
                        type="button"
                      >
                        <span className="tui-tree-prefix">├──</span>
                        <span className="tui-tree-label">mods/</span>
                        {importer && <span className="tui-inline-status">[{mods.filter((mod) => mod.enabled).length}]</span>}
                      </button>

                      {importer && visibleMods.map((mod) => (
                        <div key={mod.path} className="tui-tree-row tui-tree-mod">
                          <span className="tui-tree-prefix">│   ├──</span>
                          <button
                            className="tui-tree-checkbox"
                            onClick={(event) => {
                              event.stopPropagation()
                              void handleToggleMod(game, mod)
                            }}
                            type="button"
                          >
                            {mod.enabled ? '[✓]' : '[✗]'}
                          </button>
                          <button
                            className="tui-tree-label"
                            onClick={() => handleSelectGame({ type: 'mods', gameId: game.id })}
                            type="button"
                          >
                            {mod.name}
                          </button>
                        </div>
                      ))}

                      {importer && hasHiddenMods && (
                        <button
                          className="tui-tree-row tui-tree-mod"
                          onClick={() => handleSelectGame({ type: 'mods', gameId: game.id })}
                          type="button"
                        >
                          <span className="tui-tree-prefix">│   └──</span>
                          <span className="tui-tree-label">... see all mods</span>
                        </button>
                      )}

                      <button
                        className={`tui-tree-row ${selectedNode.type === 'config' && selectedNode.gameId === game.id ? 'is-active' : ''}`}
                        onClick={() => handleSelectGame({ type: 'config', gameId: game.id })}
                        type="button"
                      >
                        <span className="tui-tree-prefix">└──</span>
                        <span className="tui-tree-label">config</span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <button className="tui-section-title" onClick={() => handleToggleSection('catalog')} type="button">
          {sections.catalog ? '[-]' : '[+]'} CATALOG
        </button>
        {sections.catalog && (
          <div className="tui-tree-block">
            {CATALOG_ENTRIES.map((entry) => {
              const progress = downloadProgresses[entry.id] ?? null
              const installedGame = games.find((game) =>
                entry.slugHints.some((hint) => game.slug.toLowerCase().includes(hint) || game.name.toLowerCase().includes(hint)),
              )
              return (
                <button
                  key={entry.id}
                  className={`tui-tree-row ${selectedNode.type === 'catalog' && selectedNode.catalogId === entry.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedNode({ type: 'catalog', catalogId: entry.id })}
                  type="button"
                >
                  <span className="tui-tree-prefix">├──</span>
                  <span className="tui-tree-label">{entry.name}</span>
                  <span className="tui-inline-status">{getInstallStatus(entry, progress, isCatalogInstalled(entry), installedGame)}</span>
                </button>
              )
            })}
          </div>
        )}

        <button className="tui-section-title" onClick={() => handleToggleSection('system')} type="button">
          {sections.system ? '[-]' : '[+]'} SYSTEM
        </button>
        {sections.system && (
          <div className="tui-tree-block">
            <button
              className={`tui-tree-row ${selectedNode.type === 'settings' ? 'is-active' : ''}`}
              onClick={() => setSelectedNode({ type: 'settings' })}
              type="button"
            >
              <span className="tui-tree-prefix">├──</span>
              <span className="tui-tree-label">settings</span>
            </button>
            <button
              className={`tui-tree-row ${selectedNode.type === 'add-game' ? 'is-active' : ''}`}
              onClick={() => setSelectedNode({ type: 'add-game' })}
              type="button"
            >
              <span className="tui-tree-prefix">└──</span>
              <span className="tui-tree-label">add local game</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  function renderGamePanel(game: Game): JSX.Element {
    const importer = getGameImporter(game)
    const mods = modsByGame[game.id] ?? EMPTY_MODS
    const activeMods = mods.filter((mod) => mod.enabled).length
    const isRunning = runningGames.has(game.id)
    const launchBar = launchPreparation.pendingGameId === game.id && launchPreparation.active
    const mappedCatalog = findCatalogEntryForGame(game)
    const relatedProgress = mappedCatalog ? downloadProgresses[mappedCatalog.id] : null
    const modsSelected = selectedNode.type === 'mods' && selectedNode.gameId === game.id
    const configSelected = selectedNode.type === 'config' && selectedNode.gameId === game.id
    const canUpdate = game.download?.status === 'update_available'
    const versionLabel =
      game.download?.currentVersion && game.download?.latestVersion && game.download.currentVersion !== game.download.latestVersion
        ? `${game.download.currentVersion} -> ${game.download.latestVersion}`
        : game.download?.currentVersion ?? game.update?.currentVersion ?? 'unknown'
    const updateLabel =
      game.download?.status === 'update_available'
        ? 'AVAILABLE'
        : game.download?.latestVersion
          ? 'UP TO DATE'
          : 'UNKNOWN'

    return (
      <div className="tui-detail-split tui-detail-split-game">
        <div className="tui-cover-panel">
          {game.coverImage ? (
            <CoverImage imagePath={game.coverImage} alt={game.name} variant="modal" />
          ) : (
            <div className="tui-cover-fallback">{placeholderLabel(game.name)}</div>
          )}
        </div>

        <div className="tui-terminal-panel tui-game-panel">
          <div className="tui-terminal-header">{`> ${game.name.toUpperCase()}`}</div>
          <div className="tui-kv-list">
            <div><span>version</span><span>{versionLabel}</span></div>
            <div><span>updates</span><span>{updateLabel}</span></div>
            <div><span>runner</span><span>{game.runner.path || game.runner.type}</span></div>
            <div><span>mods</span><span>{importer ? `${activeMods} active` : 'unsupported'}</span></div>
            <div><span>playtime</span><span>{formatPlaytimeHours(game.playtime)}</span></div>
            <div><span>status</span><span>{isRunning ? 'RUNNING' : launchBar ? 'PREPARING' : 'IDLE'}</span></div>
            <div><span>path</span><span className="tui-truncate">{game.directory}</span></div>
          </div>

          {launchBar && (
            <div className="tui-progress-block">
              <div className="tui-progress-line">[{createProgressBar(launchPreparation.progress)}] {launchPreparation.progress}%</div>
              <div className="tui-meta-line">
                {launchPreparation.phase === 'xxmi' ? 'installing xxmi' : 'installing proton-ge'}
              </div>
            </div>
          )}

          {relatedProgress && ['downloading', 'verifying', 'extracting'].includes(relatedProgress.status) && (
            <div className="tui-progress-block">
              <div className="tui-progress-line">[{createProgressBar(relatedProgress.percent)}] {relatedProgress.percent}%</div>
              <div className="tui-meta-line">{describeProgress(relatedProgress)}</div>
            </div>
          )}

          <div className="tui-divider" />

          <div className="tui-action-row">
            <button className="tui-command" onClick={() => void handleLaunchGame(game)} type="button">
              [PLAY]
            </button>
            {canUpdate && mappedCatalog && (
              <button className="tui-command" onClick={() => void handleCatalogStart(mappedCatalog)} type="button">
                [UPDATE]
              </button>
            )}
            <button
              className={`tui-command ${modsSelected ? 'is-selected' : ''}`}
              onClick={() => setSelectedNode({ type: 'mods', gameId: game.id })}
              type="button"
            >
              [MODS]
            </button>
            <button
              className={`tui-command ${configSelected ? 'is-selected' : ''}`}
              onClick={() => setSelectedNode({ type: 'config', gameId: game.id })}
              type="button"
            >
              [CFG]
            </button>
            <button className="tui-command tui-command-danger" onClick={() => void handleDeleteGame(game)} type="button">
              [DEL]
            </button>
          </div>

          {(modsSelected || configSelected) && <div className="tui-divider" />}

          {modsSelected && renderModsPanel(game, true)}
          {configSelected && renderConfigPanel(game, true)}
        </div>
      </div>
    )
  }

  function renderModsPanel(game: Game, inline = false): JSX.Element {
    const importer = getGameImporter(game)
    const mods = modsByGame[game.id] ?? EMPTY_MODS

    return (
      <div className={inline ? 'tui-subpanel tui-subpanel-scroll' : 'tui-terminal-panel tui-terminal-full'}>
        <div className="tui-terminal-header">{`> ${game.name.toUpperCase()} / MODS`}</div>
        {!importer && <div className="tui-meta-line">mods are not supported for this title</div>}
        {importer && (
          <>
            <div className="tui-mod-list-shell">
              <div className="tui-mod-list">
                {mods.length === 0 && <div className="tui-meta-line">no mods detected</div>}
                {mods.map((mod) => (
                  <div key={mod.path} className="tui-mod-row">
                    <button className="tui-tree-checkbox" onClick={() => void handleToggleMod(game, mod)} type="button">
                      {mod.enabled ? '[✓]' : '[✗]'}
                    </button>
                    {editingModPath === mod.path ? (
                      <input
                        className="tui-input tui-input-inline"
                        value={editingModName}
                        onChange={(event) => setEditingModName(event.target.value)}
                        onBlur={() => void handleRenameMod(game, mod)}
                        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                          if (event.key === 'Enter') {
                            void handleRenameMod(game, mod)
                          }
                          if (event.key === 'Escape') {
                            setEditingModPath(null)
                            setEditingModName('')
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <button
                        className="tui-mod-name"
                        onDoubleClick={() => {
                          setEditingModPath(mod.path)
                          setEditingModName(mod.name)
                        }}
                        type="button"
                      >
                        {mod.name}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="tui-divider" />

            <div className="tui-action-row">
              <button className="tui-command" onClick={() => void handleEnableAllMods(game, true)} type="button">
                [ENABLE ALL]
              </button>
              <button className="tui-command" onClick={() => void handleEnableAllMods(game, false)} type="button">
                [DISABLE ALL]
              </button>
              <button
                className="tui-command"
                onClick={() => {
                  if (importer) {
                    void handleOpenModsFolder(importer)
                  }
                }}
                disabled={!importer}
                type="button"
              >
                [OPEN MODS FOLDER]
              </button>
              <div className="tui-menu-group">
                <button
                  className={`tui-command ${modImportMenuGameId === game.id ? 'is-selected' : ''}`}
                  onClick={() => setModImportMenuGameId((current) => (current === game.id ? null : game.id))}
                  type="button"
                >
                  {modImportMenuGameId === game.id ? '[ADD MOD ▾]' : '[ADD MOD ▴]'}
                </button>
                {modImportMenuGameId === game.id && (
                  <div className="tui-menu-list">
                    <button className="tui-menu-item" onClick={() => void handleAddMod(game, 'file')} type="button">
                      import archive
                    </button>
                    <button className="tui-menu-item" onClick={() => void handleAddMod(game, 'directory')} type="button">
                      import folder
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  function renderConfigPanel(game: Game, inline = false): JSX.Element {
    if (!configDraft) {
      return <div className={inline ? 'tui-subpanel' : 'tui-terminal-panel tui-terminal-full'}>loading config...</div>
    }

    return (
      <div className={inline ? 'tui-subpanel' : 'tui-terminal-panel tui-terminal-full'}>
        <div className="tui-terminal-header">{`> ${game.name.toUpperCase()} / CONFIG`}</div>

        <div className="tui-form-grid">
          <label className="tui-field">
            <span>name</span>
            <input
              className="tui-input"
              value={configDraft.name}
              onChange={(event) => setConfigDraft({ ...configDraft, name: event.target.value })}
            />
          </label>
          <label className="tui-field">
            <span>runner</span>
            <select
              className="tui-select"
              value={configDraft.runnerPath}
              onChange={(event) => setConfigDraft({ ...configDraft, runnerPath: event.target.value })}
            >
              <option value="">auto</option>
              {runners.map((runner) => (
                <option key={runner.path} value={runner.path}>
                  {runner.name} ({runner.type})
                </option>
              ))}
            </select>
          </label>
          <label className="tui-field">
            <span>prefix</span>
            <input
              className="tui-input"
              value={configDraft.prefix}
              onChange={(event) => setConfigDraft({ ...configDraft, prefix: event.target.value })}
            />
          </label>
          <label className="tui-field">
            <span>mods</span>
            <select
              className="tui-select"
              value={configDraft.modsEnabled ? 'enabled' : 'disabled'}
              onChange={(event) => setConfigDraft({ ...configDraft, modsEnabled: event.target.value === 'enabled' })}
            >
              <option value="enabled">enabled</option>
              <option value="disabled">disabled</option>
            </select>
          </label>
          {isGenshinGame(game) && (
            <label className="tui-field">
              <span>fps unlock</span>
              <select
                className="tui-select"
                value={configDraft.genshinFpsUnlock}
                onChange={(event) => setConfigDraft({ ...configDraft, genshinFpsUnlock: event.target.value })}
              >
                {GENSHIN_FPS_UNLOCK_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option === 'off' ? 'off' : `${option} fps`}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="tui-config-section">
          <div className="tui-config-title">env vars</div>
          <pre className="tui-code-block">
            {Object.keys(game.launch.env).length === 0
              ? '# no custom environment variables'
              : Object.entries(game.launch.env).map(([key, value]) => `${key}=${value}`).join('\n')}
          </pre>
        </div>

        <div className="tui-config-section">
          <div className="tui-config-title">launch args</div>
          <pre className="tui-code-block">{game.launch.args || '# none'}</pre>
        </div>

        <div className="tui-action-row">
          <button className="tui-command" onClick={() => void handleSaveConfig()} disabled={savingConfig} type="button">
            {savingConfig ? '[SAVING]' : '[SAVE CFG]'}
          </button>
          <button className="tui-command" onClick={() => void handleChangeCoverImage()} type="button">
            [COVER IMG]
          </button>
          <button className="tui-command" onClick={() => openSystemPath(game.directory)} type="button">
            [OPEN GAME DIR]
          </button>
        </div>
      </div>
    )
  }

  function renderSettingsPanel(): JSX.Element {
    if (configLoading || !config) {
      return <div className="tui-terminal-panel tui-terminal-full">loading settings...</div>
    }

    return (
      <div className="tui-terminal-panel tui-terminal-full">
        <div className="tui-terminal-header">&gt; SETTINGS</div>

        <div className="tui-settings-section tui-home-section">
          <div className="tui-config-title">runners</div>
          <div className="tui-kv-list">
            <div><span>default runner</span><span>{config.runner.defaultType}</span></div>
            <div><span>installed proton-ge</span><span>{installedRunner?.name ?? 'not installed'}</span></div>
          </div>
          {runnerDownloading && (
            <div className="tui-progress-block">
              <div className="tui-progress-line">[{createProgressBar(runnerProgress)}] {runnerProgress}%</div>
            </div>
          )}
          {runnerError && <div className="tui-meta-line tui-error">{runnerError}</div>}
          <div className="tui-action-row">
            <button className="tui-command" onClick={() => void handleRunnerDownload()} disabled={runnerDownloading} type="button">
              [{runnerDownloading ? `${runnerProgress}%` : installedRunner ? 'UPDATE RUNNER' : 'DOWNLOAD RUNNER'}]
            </button>
          </div>
        </div>

        <div className="tui-settings-section tui-home-section">
          <div className="tui-config-title">appearance</div>
          <div className="tui-form-grid">
            <label className="tui-field">
              <span>theme</span>
              <select
                className="tui-select"
                value={config.ui.theme}
                onChange={(event) =>
                  void handleUpdateConfig('ui', { ...config.ui, theme: event.target.value as AppConfig['ui']['theme'] })
                }
              >
                <option value="auto">auto</option>
                <option value="dark">dark</option>
                <option value="light">light</option>
              </select>
            </label>
            <label className="tui-field">
              <span>view mode</span>
              <select
                className="tui-select"
                value={config.ui.viewMode}
                onChange={(event) =>
                  void handleUpdateConfig('ui', { ...config.ui, viewMode: event.target.value as AppConfig['ui']['viewMode'] })
                }
              >
                <option value="grid">grid</option>
                <option value="list">list</option>
              </select>
            </label>
          </div>
        </div>

        <div className="tui-settings-section tui-home-section">
          <div className="tui-config-title">steam runtime</div>
          <div className="tui-kv-list">
            <div><span>status</span><span>{steamrtStatus?.installed ? steamrtStatus.path ?? 'installed' : 'not installed'}</span></div>
          </div>
          {steamrtDownloading && (
            <div className="tui-progress-block">
              <div className="tui-progress-line">[{createProgressBar(steamrtProgress)}] {steamrtProgress}%</div>
            </div>
          )}
          {steamrtError && <div className="tui-meta-line tui-error">{steamrtError}</div>}
          <div className="tui-action-row">
            <button className="tui-command" onClick={() => void handleSteamRuntimeInstall()} disabled={steamrtDownloading} type="button">
              [{steamrtDownloading ? `${steamrtProgress}%` : steamrtStatus?.installed ? 'REINSTALL STEAMRT' : 'DOWNLOAD STEAMRT'}]
            </button>
          </div>
        </div>

        <div className="tui-settings-section tui-home-section">
          <div className="tui-config-title">data</div>
          <div className="tui-kv-list">
            <div><span>library path</span><span className="tui-truncate">{config.paths.base}</span></div>
          </div>
          <div className="tui-action-row">
            <button className="tui-command" onClick={() => openSystemPath(config.paths.base)} type="button">
              [OPEN DATA FOLDER]
            </button>
          </div>
        </div>
      </div>
    )
  }

  function renderCatalogPanel(entry: CatalogEntry): JSX.Element {
    const details = catalogDetails[entry.id]
    const form = catalogForms[entry.id]
    const progress = downloadProgresses[entry.id] ?? null
    const installed = isCatalogInstalled(entry)
    const installedGame = games.find((game) =>
      entry.slugHints.some((hint) => game.slug.toLowerCase().includes(hint) || game.name.toLowerCase().includes(hint)),
    )
    const active = progress && ['downloading', 'verifying', 'extracting'].includes(progress.status)
    const canUpdate = installedGame?.download?.status === 'update_available'
    const installedStatus =
      installedGame?.download?.status === 'update_available'
        ? 'UPDATE AVAILABLE'
        : installed
          ? 'INSTALLED'
          : active
            ? progress.status.toUpperCase()
            : 'READY'

    return (
      <div className="tui-detail-split">
        <div className="tui-cover-panel tui-cover-panel-alt">
          <div className="tui-cover-catalog" style={{ color: entry.accent, borderColor: entry.accent }}>
            {entry.coverLabel}
          </div>
        </div>

        <div className="tui-terminal-panel">
          <div className="tui-terminal-header">{`> ${entry.name.toUpperCase()}`}</div>
          <div className="tui-kv-list">
            <div><span>vendor</span><span>{entry.vendor}</span></div>
            <div><span>version</span><span>{details.version ?? 'unknown'}</span></div>
            <div><span>download</span><span>{details.sizeLabel}</span></div>
            {details.installedSizeLabel && <div><span>installed</span><span>{details.installedSizeLabel}</span></div>}
            <div><span>status</span><span>{installedStatus}</span></div>
          </div>

          {details.error && <div className="tui-meta-line tui-error">{details.error}</div>}

          {active ? (
            <div className="tui-progress-block">
              <div className="tui-progress-line">[{createProgressBar(progress.percent)}] {progress.percent}%</div>
              <div className="tui-meta-line">{describeProgress(progress)}</div>
            </div>
          ) : (
            <>
              <div className="tui-action-row tui-mode-row">
                <button
                  className={`tui-command ${form.mode === 'download' ? 'is-selected' : ''}`}
                  onClick={() => setCatalogForms((current) => ({
                    ...current,
                    [entry.id]: { ...current[entry.id], mode: 'download' },
                  }))}
                  type="button"
                >
                  [DOWNLOAD]
                </button>
                <button
                  className={`tui-command ${form.mode === 'locate' ? 'is-selected' : ''}`}
                  onClick={() => setCatalogForms((current) => ({
                    ...current,
                    [entry.id]: { ...current[entry.id], mode: 'locate' },
                  }))}
                  type="button"
                >
                  [LOCATE EXISTING]
                </button>
              </div>

              {form.mode === 'download' ? (
                <div className="tui-form-grid">
                  <label className="tui-field tui-field-span">
                    <span>install directory</span>
                    <div className="tui-inline-field">
                      <input
                        className="tui-input"
                        value={form.installDir}
                        onChange={(event) => setCatalogForms((current) => ({
                          ...current,
                          [entry.id]: { ...current[entry.id], installDir: event.target.value },
                        }))}
                      />
                      <button className="tui-command" onClick={() => void handleCatalogBrowse(entry)} type="button">
                        [BROWSE]
                      </button>
                    </div>
                  </label>
                </div>
              ) : (
                <div className="tui-form-grid">
                  <label className="tui-field tui-field-span">
                    <span>executable</span>
                    <div className="tui-inline-field">
                      <input className="tui-input" value={form.locateExePath} readOnly />
                      <button className="tui-command" onClick={() => void handleCatalogLocateBrowse(entry)} type="button">
                        [BROWSE EXE]
                      </button>
                    </div>
                  </label>
                  <label className="tui-field">
                    <span>directory</span>
                    <input className="tui-input" value={form.locateDirectory} readOnly />
                  </label>
                  <label className="tui-field">
                    <span>prefix</span>
                    <input
                      className="tui-input"
                      value={form.locatePrefix}
                      onChange={(event) => setCatalogForms((current) => ({
                        ...current,
                        [entry.id]: { ...current[entry.id], locatePrefix: event.target.value },
                      }))}
                    />
                  </label>
                  {form.locateError && <div className="tui-meta-line tui-error">{form.locateError}</div>}
                </div>
              )}
            </>
          )}

          <div className="tui-divider" />

          <div className="tui-action-row">
            {active ? (
              <button className="tui-command tui-command-danger" onClick={() => void handleCatalogCancel(entry)} type="button">
                [CANCEL]
              </button>
            ) : form.mode === 'download' ? (
              <button
                className="tui-command"
                onClick={() => void handleCatalogStart(entry)}
                disabled={(!canUpdate && installed) || !details.version}
                type="button"
              >
                [{canUpdate ? 'UPDATE' : 'INSTALL'}]
              </button>
            ) : (
              <button className="tui-command" onClick={() => void handleCatalogLocateConfirm(entry)} type="button">
                [REGISTER]
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  function renderAddGamePanel(): JSX.Element {
    return (
      <div className="tui-terminal-panel tui-terminal-full">
        <div className="tui-terminal-header">&gt; ADD LOCAL GAME</div>
        <div className="tui-form-grid">
          <label className="tui-field tui-field-span">
            <span>executable</span>
            <div className="tui-inline-field">
              <input
                className="tui-input"
                value={manualGameForm.executable}
                onChange={(event) => setManualGameForm({ ...manualGameForm, executable: event.target.value })}
              />
              <button className="tui-command" onClick={() => void handleBrowseManualExecutable()} disabled={manualGameForm.detecting} type="button">
                [{manualGameForm.detecting ? 'DETECTING' : 'BROWSE'}]
              </button>
            </div>
          </label>
          <label className="tui-field">
            <span>name</span>
            <input
              className="tui-input"
              value={manualGameForm.name}
              onChange={(event) => setManualGameForm({ ...manualGameForm, name: event.target.value })}
            />
          </label>
          <label className="tui-field">
            <span>directory</span>
            <input
              className="tui-input"
              value={manualGameForm.directory}
              onChange={(event) => setManualGameForm({ ...manualGameForm, directory: event.target.value })}
            />
          </label>
          <label className="tui-field">
            <span>prefix</span>
            <input
              className="tui-input"
              value={manualGameForm.prefix}
              onChange={(event) => setManualGameForm({ ...manualGameForm, prefix: event.target.value })}
            />
          </label>
          <label className="tui-field">
            <span>runner</span>
            <select
              className="tui-select"
              value={manualGameForm.runnerPath}
              onChange={(event) => setManualGameForm({ ...manualGameForm, runnerPath: event.target.value })}
            >
              <option value="">auto</option>
              {runners.map((runner) => (
                <option key={runner.path} value={runner.path}>
                  {runner.name} ({runner.type})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="tui-divider" />

        <div className="tui-action-row">
          <button className="tui-command" onClick={() => void handleAddManualGame()} type="button">
            [ADD GAME]
          </button>
        </div>
      </div>
    )
  }

  function renderHomePanel(): JSX.Element {
    const runningList = games.filter((game) => runningGames.has(game.id))
    const queueList = Object.values(downloadProgresses).filter((progress) =>
      ['downloading', 'verifying', 'extracting'].includes(progress.status),
    )
    const modsEnabledCount = games.filter((game) => game.mods.enabled).length
    const issues: string[] = []

    if (!installedRunner) {
      issues.push('runner missing')
    }
    if (!steamrtStatus?.installed) {
      issues.push('steamrt missing')
    }

    return (
      <div className="tui-terminal-panel tui-terminal-full">
        <div className="tui-terminal-header">&gt; HOME</div>

        <div className="tui-home-status-strip">
          <div className="tui-home-status-card">
            <span>running</span>
            <strong>{runningList.length > 0 ? runningList.map((game) => game.name).join(', ') : 'none'}</strong>
          </div>
          <div className="tui-home-status-card">
            <span>downloads</span>
            <strong>{queueList.length}</strong>
          </div>
          <div className="tui-home-status-card">
            <span>library</span>
            <strong>{games.length}</strong>
          </div>
        </div>

        <div className="tui-settings-section tui-home-section">
          <div className="tui-config-title">continue playing</div>
          {continueGame ? (
            <>
              <div className="tui-kv-list">
                <div><span>game</span><span>{continueGame.name}</span></div>
                <div><span>last played</span><span>{formatHomeDate(continueGame.lastPlayed)}</span></div>
                <div><span>playtime</span><span>{formatPlaytimeHours(continueGame.playtime)}</span></div>
                <div><span>status</span><span>{runningGames.has(continueGame.id) ? 'RUNNING' : 'IDLE'}</span></div>
              </div>
              <div className="tui-action-row">
                <button className="tui-command" onClick={() => void handleLaunchGame(continueGame)} type="button">
                  [PLAY]
                </button>
                <button className="tui-command" onClick={() => handleSelectGame({ type: 'mods', gameId: continueGame.id })} type="button">
                  [MODS]
                </button>
                <button className="tui-command" onClick={() => handleSelectGame({ type: 'config', gameId: continueGame.id })} type="button">
                  [CFG]
                </button>
              </div>
            </>
          ) : (
            <div className="tui-meta-line">no games in library yet</div>
          )}
        </div>

        <div className="tui-settings-section">
          <div className="tui-config-title">system health</div>
          <div className="tui-kv-list">
            <div><span>xxmi</span><span>{config ? 'ready' : 'loading'}</span></div>
            <div><span>runner</span><span>{installedRunner?.name ?? 'missing'}</span></div>
            <div><span>steamrt</span><span>{steamrtStatus?.installed ? 'ready' : 'missing'}</span></div>
            <div><span>issues</span><span>{issues.length > 0 ? issues.join(', ') : 'none'}</span></div>
          </div>
          <div className="tui-action-row">
            <button className="tui-command" onClick={() => setSelectedNode({ type: 'settings' })} type="button">
              [SETTINGS]
            </button>
            {config && (
              <button className="tui-command" onClick={() => openSystemPath(config.paths.base)} type="button">
                [OPEN DATA FOLDER]
              </button>
            )}
          </div>
        </div>

        <div className="tui-settings-section">
          <div className="tui-config-title">quick picks</div>
          {quickPicks.length > 0 ? (
            <div className="tui-mod-list">
              {quickPicks.map((game) => {
                const mods = modsByGame[game.id] ?? EMPTY_MODS
                const importer = getGameImporter(game)

                return (
                  <div key={game.id} className="tui-config-section">
                    <div className="tui-kv-list">
                      <div><span>game</span><span>{game.name}</span></div>
                      <div><span>last played</span><span>{formatHomeDate(game.lastPlayed)}</span></div>
                      <div><span>summary</span><span>{`${formatPlaytimeHours(game.playtime)} • ${mods.filter((mod) => mod.enabled).length} mods active`}</span></div>
                    </div>
                    <div className="tui-action-row">
                      <button className="tui-command" onClick={() => void handleLaunchGame(game)} type="button">
                        [PLAY]
                      </button>
                      <button className="tui-command" onClick={() => handleSelectGame({ type: 'mods', gameId: game.id })} type="button">
                        [MODS]
                      </button>
                      <button className="tui-command" onClick={() => handleSelectGame({ type: 'config', gameId: game.id })} type="button">
                        [CFG]
                      </button>
                      <button
                        className="tui-command"
                        onClick={() => {
                          if (importer) {
                            void handleOpenModsFolder(importer)
                          }
                        }}
                        disabled={!importer}
                        type="button"
                      >
                        [OPEN MODS]
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="tui-meta-line">add a game to populate quick picks</div>
          )}
        </div>
      </div>
    )
  }

  function renderDetailPane(): JSX.Element {
    if (gamesLoading || configLoading) {
      return (
        <div className="tui-terminal-panel tui-terminal-full">
          loading nekomimi workspace...
        </div>
      )
    }

    if (gamesError) {
      return (
        <div className="tui-terminal-panel tui-terminal-full">
          <div className="tui-terminal-header">&gt; ERROR</div>
          <div className="tui-meta-line tui-error">{gamesError}</div>
          <div className="tui-action-row">
            <button className="tui-command" onClick={() => void loadGames()} type="button">
              [RETRY]
            </button>
          </div>
        </div>
      )
    }

    if (selectedNode.type === 'home') {
      return renderHomePanel()
    }

    if (selectedNode.type === 'settings') {
      return renderSettingsPanel()
    }

    if (selectedNode.type === 'add-game') {
      return renderAddGamePanel()
    }

    if (selectedNode.type === 'catalog' && selectedCatalog) {
      return renderCatalogPanel(selectedCatalog)
    }

    if (!selectedGame) {
      return (
        <div className="tui-terminal-panel tui-terminal-full">
          select a node from the file tree
        </div>
      )
    }

    if (selectedNode.type === 'mods') {
      return renderGamePanel(selectedGame)
    }

    if (selectedNode.type === 'config') {
      return renderGamePanel(selectedGame)
    }

    return renderGamePanel(selectedGame)
  }

  const topStatus = (() => {
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
  })()

  const displayVersion = window.api.version === '0.0.0' ? APP_VERSION : window.api.version

  return (
    <div className="tui-shell">
      <header className="tui-topbar">
        <div>{`${APP_NAME.toUpperCase()} v${displayVersion}`}</div>
        <div>{topStatus}</div>
        <div>{formatStamp(clock)}</div>
      </header>

      <div className="tui-main">
        <aside className="tui-sidebar">
          {renderTree()}
        </aside>
        <main className="tui-detail">
          {renderDetailPane()}
        </main>
      </div>

      <footer className="tui-bottombar">
        <div className="tui-prompt">
          <span>{statusLine}</span>
          <span className="tui-cursor" aria-hidden="true">█</span>
        </div>
        <div className="tui-footer-state">
          {launchStatus ?? activeGameState}
        </div>
      </footer>
    </div>
  )
}

export default App
