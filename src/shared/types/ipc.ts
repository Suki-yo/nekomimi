// IPC channel contracts - defines what renderer can ask main to do
// Each channel has: request (what you send) and response (what you get back)

import type { AppConfig } from './config'
import type { Game, DetectedGameInfo, DetectedRunner } from './game'
import type { Runner } from './runner'

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

  // ─────────────────────────────────────────────
  // Dialog
  // ─────────────────────────────────────────────
  'dialog:openFile': {
    request: void
    response: string | null
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
    request: Omit<Game, 'id' | 'playtime' | 'lastPlayed'>
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
  'game:running': {
    request: void
    response: { id: string; startTime: number }[]
  }

  // ─────────────────────────────────────────────
  // Runners
  // ─────────────────────────────────────────────
  'runner:scan': {
    request: void
    response: Runner[]
  }
  'runner:list': {
    request: void
    response: DetectedRunner[]
  }
  'runner:download': {
    request: { type: 'proton' | 'wine'; version: string }
    response: { success: boolean; error?: string }
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
  'mods:runner-download': {
    request: void
    response: { success: boolean; error?: string }
  }
  'mods:runner-info': {
    request: void
    response: { name: string; path: string; wine: string } | null
  }
}

// Utility type - extracts request type for a channel
export type IPCRequest<K extends keyof IPCChannels> = IPCChannels[K]['request']

// Utility type - extracts response type for a channel
export type IPCResponse<K extends keyof IPCChannels> = IPCChannels[K]['response']
