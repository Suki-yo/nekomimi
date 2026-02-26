// IPC handlers for game operations

import { ipcMain } from 'electron'
import * as crypto from 'crypto'
import {
  getGames,
  getGame as dbGetGame,
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
import { detectGame, detectRunners } from '../services/game-detector'
import { launchGame, getRunningGames } from '../services/game-launcher'
import type { Game } from '../../shared/types'

export const registerGamesHandlers = () => {
  // List all games (returns full Game objects with config data)
  ipcMain.handle('game:list', (): Game[] => {
    const rows = getGames()
    const games: Game[] = []

    for (const row of rows) {
      const config = loadGameConfig(row.config_path)
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

    return loadGameConfig(row.config_path)
  })

  // Add a new game
  ipcMain.handle(
    'game:add',
    (_event, input: Omit<Game, 'id' | 'playtime' | 'lastPlayed'>): Game => {
      const id = crypto.randomUUID()
      const slug = input.slug || generateSlug(input.name)
      const configPath = getGameConfigPath(slug)

      // Create the full Game object
      const game: Game = {
        ...input,
        id,
        slug,
        playtime: 0,
        lastPlayed: undefined,
      }

      // Save YAML config
      saveGameConfig(game)

      // Create database entry
      const dbInput: CreateGameInput = {
        id,
        name: game.name,
        slug,
        config_path: configPath,
        cover_path: input.directory, // TODO: handle cover art
        installed: game.installed,
      }
      dbCreateGame(dbInput)

      return game
    }
  )

  // Update a game
  ipcMain.handle(
    'game:update',
    (_event, { id, updates }: { id: string; updates: Partial<Game> }): Game => {
      const row = dbGetGame(id)
      if (!row) throw new Error(`Game not found: ${id}`)

      const currentConfig = loadGameConfig(row.config_path)
      if (!currentConfig) throw new Error(`Config not found for game: ${id}`)

      // Merge updates into config
      const updatedGame: Game = { ...currentConfig, ...updates }
      saveGameConfig(updatedGame)

      // Update database fields if relevant
      const dbUpdates: UpdateGameInput = {}
      if (updates.name !== undefined) dbUpdates.name = updates.name
      if (updates.slug !== undefined) dbUpdates.slug = updates.slug
      if (updates.installed !== undefined) dbUpdates.installed = updates.installed
      if (updates.playtime !== undefined) dbUpdates.playtime = updates.playtime
      if (updates.lastPlayed !== undefined) dbUpdates.last_played = updates.lastPlayed

      if (Object.keys(dbUpdates).length > 0) {
        dbUpdateGame(id, dbUpdates)
      }

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

    // Delete database entry
    dbDeleteGame(id)
  })

  // Launch a game
  ipcMain.handle(
    'game:launch',
    async (_event, { id }: { id: string }): Promise<{ success: boolean; pid?: number; error?: string }> => {
      return launchGame(id)
    }
  )

  // List running games
  ipcMain.handle('game:running', () => {
    return getRunningGames()
  })

  // Detect game info from executable path
  ipcMain.handle('game:detect', (_event, { exePath }: { exePath: string }) => {
    return detectGame(exePath)
  })

  // List available runners
  ipcMain.handle('runner:list', () => {
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
