import type { Game, LaunchConfig, ModConfig } from '@shared/types/game'
import type { DownloadProgress, HoyoGameBiz } from '@shared/types/download'

export type CatalogId = 'genshin' | 'starrail' | 'zzz' | 'endfield' | 'wuwa'
export type CatalogKind = 'hoyo' | 'endfield' | 'wuwa'
export type InstallMode = 'download' | 'locate'

export interface CatalogEntry {
  id: CatalogId
  kind: CatalogKind
  name: string
  vendor: string
  accent: string
  coverLabel: string
  coverPath?: string | null
  slug: string
  slugHints: string[]
  executable: string
  defaultInstallDir: string
  defaultPrefix: string
  launch: LaunchConfig
  mods: ModConfig
  biz?: HoyoGameBiz
}

export interface CatalogDetails {
  version: string | null
  versionLabel?: string | null
  stableVersion?: string | null
  latestVersion?: string | null
  latestVersionLabel?: string | null
  updateChannel?: 'stable' | 'preload'
  sizeLabel: string
  installedSizeLabel?: string
  error: string | null
}

export interface CatalogFormState {
  mode: InstallMode
  installDir: string
  locateExePath: string
  locateDirectory: string
  locatePrefix: string
  locateError: string | null
  locating: boolean
}

export const DEFAULT_GENSHIN_FPS_UNLOCK_FPS = 200

export const CATALOG_ENTRIES: CatalogEntry[] = [
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
      preLaunch: [],
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
        NEKOMIMI_FRAMEGEN: 'lsfg-vk',
      },
      preLaunch: [],
      postLaunch: [],
      args: '',
    },
    mods: { enabled: false, importer: 'WWMI' },
  },
]

export function createCatalogForm(entry: CatalogEntry): CatalogFormState {
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

function matchesCatalogEntry(game: Pick<Game, 'slug' | 'name'>, entry: CatalogEntry): boolean {
  const slug = game.slug.toLowerCase()
  const name = game.name.toLowerCase()
  return entry.slugHints.some((hint) => slug.includes(hint) || name.includes(hint))
}

export function findCatalogEntryForGame(game: Pick<Game, 'slug' | 'name'>): CatalogEntry | undefined {
  return CATALOG_ENTRIES.find((entry) => matchesCatalogEntry(game, entry))
}

export function findInstalledCatalogGame(games: Game[], entry: CatalogEntry): Game | undefined {
  return games.find((game) => matchesCatalogEntry(game, entry))
}

export function getInstallStatus(
  entry: CatalogEntry,
  progress: DownloadProgress | null,
  installedGame?: Game,
): string {
  if (progress && ['downloading', 'verifying', 'extracting'].includes(progress.status)) {
    return `[${progress.percent}%]`
  }
  if (installedGame?.download?.status === 'update_available') {
    return '[UPDATE]'
  }
  if (installedGame) {
    return '[INSTALLED]'
  }
  return '[READY]'
}
