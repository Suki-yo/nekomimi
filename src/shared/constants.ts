// App-wide constants - NO Node.js APIs (must work in renderer too)
// Path resolution happens in src/main/services/paths.ts

// App metadata
export const APP_NAME = 'nekomimi'
export const APP_VERSION = '0.1.0'

// Config file name
export const CONFIG_FILE = 'config.yml'

// Default config values (paths are relative, resolved in paths.ts)
export const DEFAULT_CONFIG = {
  ui: {
    theme: 'auto' as const,
    viewMode: 'grid' as const,
  },
  runner: {
    defaultType: 'proton' as const,
    autoUpdate: false,
    scanPaths: [],
  },
  download: {
    concurrency: 4,
  },
}

// Runner download sources
export const RUNNER_SOURCES = {
  protonGE: 'https://github.com/GloriousEggroll/proton-ge-custom/releases',
  wineGE: 'https://github.com/GloriousEggroll/wine-ge-custom/releases',
}

// File extensions
export const GAME_CONFIG_EXT = '.yml'
