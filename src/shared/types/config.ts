// App-wide configuration types
// Actual default values live in src/shared/constants.ts

export interface AppConfig {
  // Paths - where stuff lives
  paths: {
    library: string // SQLite database
    games: string // Per-game YAML configs
    runners: string // Wine/Proton installations
    xxmi: string // XXMI Launcher + importers
    cache: string // Downloaded patches, temp files
    config: string // App configuration directory
    base: string // Base data directory
  }

  // UI preferences
  ui: {
    theme: 'light' | 'dark' | 'auto'
    viewMode: 'grid' | 'list'
  }

  // Runner preferences
  runner: {
    defaultType: 'wine' | 'proton' | 'native'
    autoUpdate: boolean
    scanPaths: string[] // Extra paths to scan for installed runners
  }

  // Download preferences (Phase 2)
  download: {
    concurrency: number // Number of parallel downloads
    mirror?: string // Preferred mirror, undefined = official
  }
}
