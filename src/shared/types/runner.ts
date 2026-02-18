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
