// IPC handlers for game operations

import { ipcMain, BrowserWindow } from 'electron'
import * as crypto from 'crypto'
import * as os from 'os'
import * as path from 'path'
import { mkdirSync } from 'fs'
import {
  getGames,
  getGame as dbGetGame,
  getGameBySlug as dbGetGameBySlug,
  createGame as dbCreateGame,
  updateGame as dbUpdateGame,
  deleteGame as dbDeleteGame,
  type CreateGameInput,
  type UpdateGameInput,
} from '../services/database'
import {
  loadGameConfig,
  saveGameConfig,
  deleteGameConfig,
  getGameConfigPath,
} from '../services/config'
import {
  invalidateCachedGameConfig,
  loadCachedGameConfig,
  setCachedGameConfig,
} from '../services/config-cache'
import { detectGame, detectRunners } from '../services/game-detector'
import { launchGame, getRunningGames, syncRunningGames } from '../services/game-launcher'
import { rebuildTrayMenu } from '../services/tray'
import type { Game } from '../../shared/types'
import type { GameAddRequest } from '../../shared/types/ipc'
import type { GameRow } from '../services/database'

const loadGameFromRow = (row: GameRow): Game | null => {
  return loadCachedGameConfig(row.config_path)
}

export const registerGamesHandlers = () => {
  // List all games (returns full Game objects with config data)
  ipcMain.handle('game:list', (): Game[] => {
    const rows = getGames()
    const games: Game[] = []

    for (const row of rows) {
      const config = loadGameFromRow(row)
      if (config) {
        games.push(config)
      }
    }

    return games
  })

  // Get a single game by ID
  ipcMain.handle('game:get', (_event, { id }: { id: string }): Game | null => {
    const row = dbGetGame(id)
    if (!row) return null

    return loadGameFromRow(row)
  })

  // Add a new game
  ipcMain.handle(
    'game:add',
    (_event, input: GameAddRequest): Game => {
      const expandTilde = (p: string) => (p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p)

      const slug = input.slug || generateSlug(input.name)

      // Return existing game if slug already taken
      const existing = dbGetGameBySlug(slug)
      if (existing) {
        const existingConfig = loadGameFromRow(existing)
        if (existingConfig) return existingConfig
      }

      const id = crypto.randomUUID()
      const configPath = getGameConfigPath(slug)

      // Auto-generate prefix if not provided
      const resolvedPrefix = expandTilde(input.runner.prefix) ||
        path.join(os.homedir(), 'Games', 'prefixes', slug, 'pfx')
      mkdirSync(resolvedPrefix, { recursive: true })

      // Create the full Game object
      const game: Game = {
        ...input,
        directory: expandTilde(input.directory),
        executable: expandTilde(input.executable),
        coverImage: input.coverImage ?? input.coverPath ?? undefined,
        runner: {
          ...input.runner,
          path: expandTilde(input.runner.path),
          prefix: resolvedPrefix,
        },
        id,
        slug,
        playtime: 0,
        lastPlayed: undefined,
      }

      // Save YAML config
      saveGameConfig(game)
      setCachedGameConfig(configPath, game)

      // Create database entry
      const dbInput: CreateGameInput = {
        id,
        name: game.name,
        slug,
        config_path: configPath,
        cover_path: input.coverPath ?? input.coverImage ?? null,
        installed: game.installed,
      }
      dbCreateGame(dbInput)
      rebuildTrayMenu()

      return game
    }
  )

  // Update a game
  ipcMain.handle(
    'game:update',
    (_event, { id, updates }: { id: string; updates: Partial<Game> }): Game => {
      const row = dbGetGame(id)
      if (!row) throw new Error(`Game not found: ${id}`)

      const currentConfig = loadGameFromRow(row)
      if (!currentConfig) throw new Error(`Config not found for game: ${id}`)

      // Merge updates into config
      const updatedGame: Game = { ...currentConfig, ...updates }
      saveGameConfig(updatedGame)
      invalidateCachedGameConfig(row.config_path)
      setCachedGameConfig(getGameConfigPath(updatedGame.slug), updatedGame)

      // Update database fields if relevant
      const dbUpdates: UpdateGameInput = {}
      if (updates.name !== undefined) dbUpdates.name = updates.name
      if (updates.slug !== undefined) dbUpdates.slug = updates.slug
      if (updates.coverImage !== undefined) dbUpdates.cover_path = updates.coverImage
      if (updates.installed !== undefined) dbUpdates.installed = updates.installed
      if (updates.playtime !== undefined) dbUpdates.playtime = updates.playtime
      if (updates.lastPlayed !== undefined) dbUpdates.last_played = updates.lastPlayed

      if (Object.keys(dbUpdates).length > 0) {
        dbUpdateGame(id, dbUpdates)
      }

      rebuildTrayMenu()

      return updatedGame
    }
  )

  // Delete a game
  ipcMain.handle('game:delete', (_event, { id }: { id: string }): void => {
    const row = dbGetGame(id)
    if (!row) return

    // Delete config file
    if (row.slug) {
      deleteGameConfig(row.slug)
    }
    invalidateCachedGameConfig(row.config_path)

    // Delete database entry
    dbDeleteGame(id)
    rebuildTrayMenu()
  })

  // Launch a game
  ipcMain.handle(
    'game:launch',
    async (event, { id }: { id: string }): Promise<{ success: boolean; pid?: number; error?: string }> => {
      const win = BrowserWindow.fromWebContents(event.sender)
      return launchGame(id, (step, percent) => {
        win?.webContents.send('game:launch-progress', { step, percent })
      })
    }
  )

  // List running games
  ipcMain.handle('game:running', () => {
    const rows = getGames()
    const knownGames: Array<{ id: string; configPath: string; game: Game }> = []

    for (const row of rows) {
      const config = loadGameFromRow(row)
      if (config) {
        knownGames.push({ id: row.id, configPath: getGameConfigPath(config.slug), game: config })
      }
    }

    syncRunningGames(knownGames)
    return getRunningGames()
  })

  // Detect game info from executable path
  ipcMain.handle('game:detect', (_event, { exePath }: { exePath: string }) => {
    return detectGame(exePath)
  })

  // List available runners
  ipcMain.handle('game:runners', () => {
    return detectRunners()
  })
}

// Generate URL-safe slug from name
const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
