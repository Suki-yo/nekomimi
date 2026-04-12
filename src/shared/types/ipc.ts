// IPC channel contracts - defines what renderer can ask main to do
// Each channel has: request (what you send) and response (what you get back)

import type { AppConfig } from './config'
import type { Game, DetectedGameInfo, DetectedRunner, Mod } from './game'
import type { HoyoVersionInfo, WuwaVersionInfo, DownloadProgress } from './download'
import type { PreflightReport } from './preflight'
import type { RunnerKind, RunnerStatus, RunnerUpdateInfo } from './runner'
import type { TwintailImportOptions, TwintailImportResult, TwintailImportStatus } from './twintail'

export type GameAddRequest = Omit<Game, 'id' | 'playtime' | 'lastPlayed'> & {
  coverPath?: string | null
}

// All IPC channels - this is the contract between frontend and backend
export interface IPCChannels {
  // ─────────────────────────────────────────────
  // Config
  // ─────────────────────────────────────────────
  'config:get': {
    request: void
    response: AppConfig
  }
  'config:update': {
    request: Partial<AppConfig>
    response: AppConfig
  }
  'app:version': {
    request: void
    response: string
  }

  // ─────────────────────────────────────────────
  // Dialog
  // ─────────────────────────────────────────────
  'dialog:openFile': {
    request: void
    response: string | null
  }
  'dialog:openImage': {
    request: { defaultPath?: string }
    response: string | null
  }
  'dialog:openModSource': {
    request: { defaultPath?: string; mode: 'file' | 'directory' }
    response: { path: string; kind: 'file' | 'directory' } | null
  }
  'image:read': {
    request: { imagePath: string }
    response: string | null  // file:// URL
  }

  // ─────────────────────────────────────────────
  // Games
  // ─────────────────────────────────────────────
  'game:list': {
    request: void
    response: Game[]
  }
  'game:get': {
    request: { id: string }
    response: Game | null
  }
  'game:add': {
    request: GameAddRequest
    response: Game
  }
  'game:update': {
    request: { id: string; updates: Partial<Game> }
    response: Game
  }
  'game:delete': {
    request: { id: string }
    response: void
  }
  'game:launch': {
    request: { id: string }
    response: { success: boolean; pid?: number; error?: string }
  }
  'game:detect': {
    request: { exePath: string }
    response: DetectedGameInfo
  }
  'game:runners': {
    request: void
    response: DetectedRunner[]
  }
  'game:running': {
    request: void
    response: { id: string; startTime: number }[]
  }

  // ─────────────────────────────────────────────
  // Runners
  // ─────────────────────────────────────────────
  'runner:list': {
    request: void
    response: RunnerStatus[]
  }
  'runner:install': {
    request: { kind: RunnerKind; version?: string }
    response: { ok: boolean; installedTag?: string; error?: string }
  }
  'runner:check-updates': {
    request: void
    response: RunnerUpdateInfo[]
  }
  'runner:remove': {
    request: { kind: RunnerKind; version: string }
    response: { ok: boolean; error?: string }
  }

  // ─────────────────────────────────────────────
  // Mods (XXMI, etc.)
  // ─────────────────────────────────────────────
  'mods:xxmi-status': {
    request: void
    response: { xxmiInstalled: boolean; runnerInstalled: boolean }
  }
  'mods:xxmi-download': {
    request: void
    response: { success: boolean; error?: string }
  }
  // Mod management
  'mods:list': {
    request: { importer: string }
    response: Mod[]
  }
  'mods:toggle': {
    request: { modPath: string; enabled: boolean }
    response: { success: boolean }
  }
  'mods:install': {
    request: { importer: string; sourcePath: string }
    response: { success: boolean; error?: string }
  }
  'mods:delete': {
    request: { modPath: string }
    response: { success: boolean }
  }
  'mods:enable-all': {
    request: { importer: string }
    response: void
  }
  'mods:disable-all': {
    request: { importer: string }
    response: void
  }
  'mods:rename': {
    request: { modPath: string; customName: string }
    response: { success: boolean; newPath?: string; error?: string }
  }
  'mods:open-folder': {
    request: { importer: string }
    response: { success: boolean; path?: string; error?: string }
  }

  // ─────────────────────────────────────────────
  // Preflight
  // ─────────────────────────────────────────────
  'preflight:check': {
    request: void
    response: PreflightReport
  }
  'preflight:refresh': {
    request: void
    response: PreflightReport
  }

  // ─────────────────────────────────────────────
  // Steam Runtime
  // ─────────────────────────────────────────────
  'steamrt:status': {
    request: void
    response: { installed: boolean; path: string | null }
  }
  'steamrt:install': {
    request: void
    response: { success: boolean; error?: string }
  }

  // ─────────────────────────────────────────────
  // Downloads
  // ─────────────────────────────────────────────
  'download:fetch-info': {
    request: { biz: 'genshin' | 'starrail' | 'zzz' }
    response: HoyoVersionInfo | null
  }
  'download:start': {
    request: { gameId: string; biz: 'genshin' | 'starrail' | 'zzz'; destDir: string; manifestUrl?: string; useTwintail?: boolean; preferVersion?: string }
    response: { success: boolean; error?: string }
  }
  'download:cancel': {
    request: { gameId: string }
    response: { success: boolean }
  }
  'download:status': {
    request: { gameId: string }
    response: { inProgress: boolean }
  }
  'download:check-updates': {
    request: { biz: 'genshin' | 'starrail' | 'zzz'; currentVersion?: string; installDir?: string }
    response: {
      hasUpdate: boolean
      currentVersion: string | undefined
      latestVersion: string | undefined
      latestVersionLabel?: string
      updateChannel?: 'stable' | 'preload'
      updateSizeBytes?: number
      downloadMode: 'zip' | 'sophon' | undefined
    }
  }
  'download:fetch-endfield-info': {
    request: Record<string, never>
    response: { version: string; totalSize: number; installedSize: number } | null
  }
  'download:start-endfield': {
    request: { gameId: string; destDir: string }
    response: { success: boolean; error?: string }
  }
  'download:fetch-wuwa-info': {
    request: Record<string, never>
    response: WuwaVersionInfo | null
  }
  'download:start-wuwa': {
    request: { gameId: string; destDir: string }
    response: { success: boolean; error?: string }
  }
  'download:check-wuwa-updates': {
    request: { currentVersion?: string; installDir?: string }
    response: {
      hasUpdate: boolean
      currentVersion: string | undefined
      latestVersion: string | undefined
    }
  }

  // ─────────────────────────────────────────────
  // Twintail Import
  // ─────────────────────────────────────────────
  'twintail:detect': {
    request: void
    response: TwintailImportStatus
  }
  'twintail:import': {
    request: TwintailImportOptions
    response: TwintailImportResult
  }
}

export interface IPCEvents {
  'download:progress': DownloadProgress
  'download:complete': { gameId: string }
  'download:error': { gameId: string; error: string }
  'game:launch-progress': { step: string; percent: number }
  'mods:changed': { importer: string }
  'mods:xxmi-progress': number
  'runner:progress': number
  'runner:updates-available': RunnerUpdateInfo[]
  'steamrt:progress': number
}

// Utility type - extracts request type for a channel
export type IPCRequest<K extends keyof IPCChannels> = IPCChannels[K]['request']

// Utility type - extracts response type for a channel
export type IPCResponse<K extends keyof IPCChannels> = IPCChannels[K]['response']

export type IPCEventPayload<K extends keyof IPCEvents> = IPCEvents[K]
