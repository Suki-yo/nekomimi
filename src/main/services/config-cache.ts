import * as fs from 'fs'
import type { Game } from '../../shared/types'
import { loadGameConfig } from './config'

interface CachedGameConfig {
  game: Game | null
  mtimeMs: number
}

const gameConfigCache = new Map<string, CachedGameConfig>()

export function loadCachedGameConfig(configPath: string): Game | null {
  try {
    const stat = fs.statSync(configPath)
    const cached = gameConfigCache.get(configPath)
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.game
    }

    const game = loadGameConfig(configPath)
    gameConfigCache.set(configPath, {
      game,
      mtimeMs: stat.mtimeMs,
    })
    return game
  } catch {
    gameConfigCache.delete(configPath)
    return null
  }
}

export function invalidateCachedGameConfig(configPath: string): void {
  gameConfigCache.delete(configPath)
}

export function setCachedGameConfig(configPath: string, game: Game | null): void {
  try {
    const stat = fs.statSync(configPath)
    gameConfigCache.set(configPath, {
      game,
      mtimeMs: stat.mtimeMs,
    })
  } catch {
    gameConfigCache.delete(configPath)
  }
}
