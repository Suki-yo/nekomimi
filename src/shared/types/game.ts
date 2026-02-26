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

export interface ModConfig {
  // TODO: Phase 3 - will expand when we add mod support
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
