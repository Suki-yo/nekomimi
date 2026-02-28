// Config service - YAML file operations
// Handles app config and per-game configs

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'yaml'
import { getPathsInstance } from './paths'
import { DEFAULT_CONFIG } from '../../shared/constants'
import type { AppConfig, Game } from '../../shared/types'

// ─────────────────────────────────────────────
// App Config (config.yml)
// ─────────────────────────────────────────────

export const loadAppConfig = (): AppConfig => {
  const paths = getPathsInstance()
  const configPath = path.join(paths.config, 'config.yml')

  if (!fs.existsSync(configPath)) {
    // Create default config if missing
    const defaultConfig = buildDefaultConfig(paths)
    saveAppConfig(defaultConfig)
    return defaultConfig
  }

  const content = fs.readFileSync(configPath, 'utf-8')
  const parsed = yaml.parse(content)

  // Merge with defaults (in case new fields were added)
  return {
    paths: paths,
    ui: { ...DEFAULT_CONFIG.ui, ...parsed.ui },
    runner: { ...DEFAULT_CONFIG.runner, ...parsed.runner },
    download: { ...DEFAULT_CONFIG.download, ...parsed.download },
  }
}

export const saveAppConfig = (config: AppConfig): void => {
  const paths = getPathsInstance()

  // Ensure directory exists
  fs.mkdirSync(paths.config, { recursive: true })

  // Omit paths from saved config (they're computed at runtime)
  const toSave = {
    ui: config.ui,
    runner: config.runner,
    download: config.download,
  }

  const content = yaml.stringify(toSave)
  fs.writeFileSync(path.join(paths.config, 'config.yml'), content, 'utf-8')
}

const buildDefaultConfig = (paths: ReturnType<typeof getPathsInstance>): AppConfig => {
  return {
    paths: paths,
    ui: DEFAULT_CONFIG.ui,
    runner: DEFAULT_CONFIG.runner,
    download: DEFAULT_CONFIG.download,
  }
}

// ─────────────────────────────────────────────
// Game Config (games/*.yml)
// ─────────────────────────────────────────────

export const loadGameConfig = (configPath: string): Game | null => {
  if (!fs.existsSync(configPath)) {
    return null
  }

  const content = fs.readFileSync(configPath, 'utf-8')
  return yaml.parse(content) as Game
}

export const saveGameConfig = (game: Game): void => {
  const paths = getPathsInstance()
  const gamesDir = paths.games

  // Ensure games directory exists
  fs.mkdirSync(gamesDir, { recursive: true })

  const configPath = path.join(gamesDir, `${game.slug}.yml`)
  const content = yaml.stringify(game)

  fs.writeFileSync(configPath, content, 'utf-8')
}

export const deleteGameConfig = (slug: string): void => {
  const paths = getPathsInstance()
  const configPath = path.join(paths.games, `${slug}.yml`)

  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath)
  }
}

export const getGameConfigPath = (slug: string): string => {
  const paths = getPathsInstance()
  return path.join(paths.games, `${slug}.yml`)
}
