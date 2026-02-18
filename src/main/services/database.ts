// Database service - SQLite operations for game library
// Uses better-sqlite3 for synchronous API

import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'
import { getPaths } from './paths'

// Module-level singleton - initialized once in initDatabase()
let db: Database.Database | null = null

// Initialize database connection and create tables
export const initDatabase = (): void => {
  const paths = getPaths()

  // Ensure directory exists before creating database
  fs.mkdirSync(path.dirname(paths.library), { recursive: true })

  db = new Database(paths.library)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      slug         TEXT UNIQUE,
      config_path  TEXT NOT NULL,
      cover_path   TEXT,
      installed    INTEGER DEFAULT 0,
      playtime     REAL DEFAULT 0,
      last_played  TEXT,
      created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at   TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tags (
      id   TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_tags (
      game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
      tag_id  TEXT REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (game_id, tag_id)
    );
  `)
}

// Private helper - ensures db is initialized before use
const getDb = (): Database.Database => {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

// ─────────────────────────────────────────────
// Game operations
// ─────────────────────────────────────────────

export interface GameRow {
  id: string
  name: string
  slug: string | null
  config_path: string
  cover_path: string | null
  installed: number    // SQLite uses 0/1 for booleans
  playtime: number
  last_played: string | null
  created_at: string
  updated_at: string
}

export const getGames = (): GameRow[] => {
  return getDb().prepare('SELECT * FROM games ORDER BY name').all() as GameRow[]
}

export const getGame = (id: string): GameRow | undefined => {
  return getDb().prepare('SELECT * FROM games WHERE id = ?').get(id) as GameRow | undefined
}

export const getGameBySlug = (slug: string): GameRow | undefined => {
  return getDb().prepare('SELECT * FROM games WHERE slug = ?').get(slug) as GameRow | undefined
}

export interface CreateGameInput {
  id: string
  name: string
  slug?: string
  config_path: string
  cover_path?: string
  installed?: boolean
}

export const createGame = (input: CreateGameInput): GameRow => {
  const stmt = getDb().prepare(`
    INSERT INTO games (id, name, slug, config_path, cover_path, installed)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    input.id,
    input.name,
    input.slug || null,
    input.config_path,
    input.cover_path || null,
    input.installed ? 1 : 0
  )

  return getGame(input.id)!
}

export interface UpdateGameInput {
  name?: string
  slug?: string
  cover_path?: string
  installed?: boolean
  playtime?: number
  last_played?: string
}

export const updateGame = (id: string, input: UpdateGameInput): GameRow => {
  const fields: string[] = []
  const values: (string | number | null)[] = []

  if (input.name !== undefined) {
    fields.push('name = ?')
    values.push(input.name)
  }
  if (input.slug !== undefined) {
    fields.push('slug = ?')
    values.push(input.slug)
  }
  if (input.cover_path !== undefined) {
    fields.push('cover_path = ?')
    values.push(input.cover_path)
  }
  if (input.installed !== undefined) {
    fields.push('installed = ?')
    values.push(input.installed ? 1 : 0)
  }
  if (input.playtime !== undefined) {
    fields.push('playtime = ?')
    values.push(input.playtime)
  }
  if (input.last_played !== undefined) {
    fields.push('last_played = ?')
    values.push(input.last_played)
  }

  if (fields.length > 0) {
    fields.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)
    getDb().prepare(`UPDATE games SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  return getGame(id)!
}

export const deleteGame = (id: string): void => {
  getDb().prepare('DELETE FROM games WHERE id = ?').run(id)
}

// ─────────────────────────────────────────────
// Tag operations
// ─────────────────────────────────────────────

export interface TagRow {
  id: string
  name: string
}

export const getTags = (): TagRow[] => {
  return getDb().prepare('SELECT * FROM tags ORDER BY name').all() as TagRow[]
}

export const createTag = (id: string, name: string): TagRow => {
  getDb().prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(id, name)
  return { id, name }
}

export const deleteTag = (id: string): void => {
  getDb().prepare('DELETE FROM tags WHERE id = ?').run(id)
}

// ─────────────────────────────────────────────
// Game-Tag relationship operations
// ─────────────────────────────────────────────

export const addGameTag = (gameId: string, tagId: string): void => {
  getDb().prepare('INSERT OR IGNORE INTO game_tags (game_id, tag_id) VALUES (?, ?)').run(gameId, tagId)
}

export const removeGameTag = (gameId: string, tagId: string): void => {
  getDb().prepare('DELETE FROM game_tags WHERE game_id = ? AND tag_id = ?').run(gameId, tagId)
}

export const getGameTags = (gameId: string): TagRow[] => {
  return getDb().prepare(`
    SELECT t.* FROM tags t
    JOIN game_tags gt ON t.id = gt.tag_id
    WHERE gt.game_id = ?
    ORDER BY t.name
  `).all(gameId) as TagRow[]
}

export const getGamesByTag = (tagId: string): GameRow[] => {
  return getDb().prepare(`
    SELECT g.* FROM games g
    JOIN game_tags gt ON g.id = gt.game_id
    WHERE gt.tag_id = ?
    ORDER BY g.name
  `).all(tagId) as GameRow[]
}

// ─────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────

export const closeDatabase = (): void => {
  if (db) {
    db.close()
    db = null
  }
}
