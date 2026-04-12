// App-wide constants - NO Node.js APIs (must work in renderer too)
// Path resolution happens in src/main/services/paths.ts

// App metadata
export const APP_NAME = 'nekomimi'

// Config file name
export const CONFIG_FILE = 'config.yml'

// Default config values (paths are relative, resolved in paths.ts)
export const DEFAULT_CONFIG = {
  ui: {
    theme: 'auto' as const,
    viewMode: 'grid' as const,
    minimizeToTray: true,
  },
  runner: {
    defaultType: 'proton' as const,
    autoUpdate: false,
  },
  download: {
    concurrency: 4,
  },
}

// File extensions
export const GAME_CONFIG_EXT = '.yml'
