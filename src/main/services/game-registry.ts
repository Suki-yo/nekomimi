import * as path from 'path'

export type XXMIImporter = 'GIMI' | 'SRMI' | 'ZZMI' | 'EFMI' | 'HIMI' | 'WWMI'
export type ImporterLaunchMode = 'Inject' | 'Hook'

interface ImporterConfig {
  importer: XXMIImporter
  importerRepo: string
  launchMode: ImporterLaunchMode
  configureGame: boolean
}

export interface GameModConfig extends ImporterConfig {
  exeNames: string[]
  umuGameId?: string
  steamAppId?: string
}

export const GAME_MOD_REGISTRY = {
  genshin: {
    exeNames: ['genshinimpact.exe'],
    importer: 'GIMI',
    importerRepo: 'SilentNightSound/GIMI-Package',
    launchMode: 'Inject',
    configureGame: true,
    umuGameId: 'umu-genshin',
  },
  starrail: {
    exeNames: ['starrail.exe'],
    importer: 'SRMI',
    importerRepo: 'SpectrumQT/SRMI-Package',
    launchMode: 'Hook',
    configureGame: true,
    umuGameId: '0',
  },
  zenless: {
    exeNames: ['zenlesszonezero.exe'],
    importer: 'ZZMI',
    importerRepo: 'leotorrez/ZZMI-Package',
    launchMode: 'Hook',
    configureGame: false,
    umuGameId: 'umu-zenlesszonezero',
  },
  endfield: {
    exeNames: ['endfield.exe'],
    importer: 'EFMI',
    importerRepo: 'SpectrumQT/EFMI-Package',
    launchMode: 'Inject',
    configureGame: true,
  },
  honkaiimpact3: {
    exeNames: ['bh3.exe'],
    importer: 'HIMI',
    importerRepo: 'leotorrez/HIMI-Package',
    launchMode: 'Hook',
    configureGame: true,
  },
  wuwa: {
    exeNames: ['client-win64-shipping.exe'],
    importer: 'WWMI',
    importerRepo: 'SpectrumQT/WWMI-Package',
    launchMode: 'Hook',
    configureGame: false,
    umuGameId: 'umu-3513350',
    steamAppId: '3513350',
  },
} as const satisfies Record<string, GameModConfig>

const GAME_MOD_CONFIGS = Object.values(GAME_MOD_REGISTRY)

const GAME_CONFIG_BY_EXE = GAME_MOD_CONFIGS.reduce<Record<string, GameModConfig>>((acc, config) => {
  for (const exeName of config.exeNames) {
    acc[exeName] = config
  }
  return acc
}, {})

const IMPORTER_CONFIG_BY_ID = GAME_MOD_CONFIGS.reduce<Record<string, ImporterConfig>>((acc, config) => {
  acc[config.importer] = {
    importer: config.importer,
    importerRepo: config.importerRepo,
    launchMode: config.launchMode,
    configureGame: config.configureGame,
  }
  return acc
}, {})

function normalizeExecutableName(executablePath: string): string {
  return path.basename(executablePath).toLowerCase()
}

export function getGameModConfig(executablePath: string): GameModConfig | null {
  return GAME_CONFIG_BY_EXE[normalizeExecutableName(executablePath)] ?? null
}

export function getImporterConfig(importer: string): ImporterConfig | null {
  return IMPORTER_CONFIG_BY_ID[importer] ?? null
}

export function getImporterReleaseApi(importer: string): string | null {
  const config = getImporterConfig(importer)
  return config ? `https://api.github.com/repos/${config.importerRepo}/releases/latest` : null
}
