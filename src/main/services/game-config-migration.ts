import { existsSync } from 'fs'
import { getGameConfigPath, loadGameConfig, saveGameConfig } from './config'
import { getGames, updateGame, type GameRow } from './database'

function migrateGameConfigPath(row: GameRow): string {
  if (!row.slug) {
    return row.config_path
  }

  const canonicalConfigPath = getGameConfigPath(row.slug)
  if (row.config_path === canonicalConfigPath) {
    return canonicalConfigPath
  }

  const legacyConfig = loadGameConfig(row.config_path)
  if (legacyConfig) {
    saveGameConfig(legacyConfig)
    updateGame(row.id, { config_path: canonicalConfigPath })
    return canonicalConfigPath
  }

  if (existsSync(canonicalConfigPath)) {
    updateGame(row.id, { config_path: canonicalConfigPath })
    return canonicalConfigPath
  }

  return row.config_path
}

export function runGameConfigMigrations(): void {
  for (const row of getGames()) {
    migrateGameConfigPath(row)
  }
}
