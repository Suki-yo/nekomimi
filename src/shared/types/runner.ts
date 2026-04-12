// Runner types - Wine, Proton, Native

export type RunnerType = 'wine' | 'proton' | 'native'

// Base runner interface - represents an installed runner on the system
export interface Runner {
  name: string
  type: RunnerType
  path: string
  version?: string
}

// Specific runner types (can extend later with specific options)
export interface WineRunner extends Runner {
  type: 'wine'
}

export interface ProtonRunner extends Runner {
  type: 'proton'
  steamRuntimePath?: string // SteamLinuxRuntime path
}

export interface NativeRunner extends Runner {
  type: 'native'
}

export type RunnerKind = 'proton-ge' | 'wine-ge' | 'steam-runtime' | 'xxmi-libs'

export interface RunnerStatus {
  kind: RunnerKind
  displayName: string
  installedVersions: string[]
  activeVersion: string | null
  path: string | null
}

export interface RunnerUpdateInfo {
  kind: RunnerKind
  installedLatest: string | null
  remoteLatest: string | null
  upToDate: boolean
  lastCheckedAt: string
  sourceUrl: string
}
