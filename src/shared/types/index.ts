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
  WuwaWwmiLaunchMode,
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
  RunnerKind,
  RunnerStatus,
  RunnerUpdateInfo,
} from './runner'

// IPC types
export type {
  IPCChannels,
  IPCEvents,
  IPCEventPayload,
  GameAddRequest,
  IPCRequest,
  IPCResponse,
} from './ipc'

export type {
  PreflightSeverity,
  PreflightCheck,
  PreflightReport,
} from './preflight'

export type {
  TwintailImportStatus,
  TwintailImportOptions,
  TwintailImportResult,
} from './twintail'

// Download types
export type {
  DownloadStatus,
  DownloadMode,
  DownloadProgress,
  GameDownloadState,
  HoyoGameBiz,
  HoyoVersionInfo,
  VoicePack,
  DiffPatch,
  SophonManifest,
  SophonManifestFile,
  SophonFileChunk,
  DownloadOptions,
} from './download'
