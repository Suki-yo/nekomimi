// Barrel exports - re-exports all types from one place
// Instead of: import { Game } from '../types/game'
// You can do:  import { Game } from '../types'

// Config types
export type { AppConfig } from './config'

// Game types
export type {
  Game,
  RunnerConfig,
  LaunchConfig,
  ModConfig,
  UpdateConfig,
  DetectedGameInfo,
  DetectedRunner,
} from './game'

// Runner types
export type {
  Runner,
  RunnerType,
  WineRunner,
  ProtonRunner,
  NativeRunner,
} from './runner'

// IPC types
export type {
  IPCChannels,
  IPCRequest,
  IPCResponse,
} from './ipc'
