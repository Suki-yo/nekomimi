// Core game interface - mirrors the YAML schema from SPEC.md

export interface Game {
  id: string
  name: string
  slug: string
  year?: number

  installed: boolean
  directory: string
  executable: string

  runner: RunnerConfig
  launch: LaunchConfig
  mods: ModConfig
  update?: UpdateConfig

  playtime: number // hours
  lastPlayed?: string // ISO timestamp
}

// Sub-types below - these are the nested structures in Game

export interface RunnerConfig {
  type: 'wine' | 'proton' | 'native'
  path: string
  prefix: string
}

export interface LaunchConfig {
  env: Record<string, string>
  preLaunch: string[]
  postLaunch: string[]
  args: string
}

// Individual mod entry
export interface Mod {
  name: string           // Display name (custom name or original)
  originalName: string   // Original folder name (extracted from (custom)original format)
  folder: string         // Actual folder name (may include DISABLED_ prefix)
  enabled: boolean       // Whether mod is active
  path: string           // Full path to mod folder
}

export interface ModConfig {
  // Global mod toggle for this game
  enabled: boolean
  // Which XXMI importer to use (e.g., "EFMI", "GIMI", "SRMI")
  importer?: string
  // Legacy XXMI path (if manually configured)
  xxmi?: {
    enabled: boolean
    path: string
  }
  fpsUnlock?: {
    enabled: boolean
    fps: number
  }
}

export interface UpdateConfig {
  // TODO: Phase 2 - will expand for update management
  source: 'official' | 'mirror'
  currentVersion: string
  channel: 'stable' | 'beta'
}

// Detection types - used when auto-detecting game info from executable

export interface DetectedGameInfo {
  name: string
  executable: string
  directory: string
  prefix: string | null
}

export interface DetectedRunner {
  name: string
  type: 'wine' | 'proton'
  path: string
}
