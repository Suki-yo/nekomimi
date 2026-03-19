// Path resolution - Node.js only
// This file uses Node APIs, so it can ONLY be imported in main process

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { APP_NAME } from '../../shared/constants'

// Base directory for all app data.
// Use one stable location in both dev and packaged runs so local testing sees
// the same library/config without depending on the current working directory.
// Set NEKOMIMI_DATA_DIR to override for isolated testing.
const getBaseDir = (): string => {
  const override = process.env.NEKOMIMI_DATA_DIR
  if (override && override.trim().length > 0) {
    return path.resolve(override)
  }

  const defaultBase = path.join(app.getPath('home'), '.local', 'share', APP_NAME)

  try {
    const stat = fs.lstatSync(defaultBase)
    if (stat.isSymbolicLink()) {
      const symlinkTarget = fs.readlinkSync(defaultBase)
      return path.resolve(path.dirname(defaultBase), symlinkTarget)
    }
  } catch {
    // Default path does not exist yet; fall back to creating it normally.
  }

  return defaultBase
}

// Resolved paths - call this after app is ready
export const getPaths = () => {
  const base = getBaseDir()

  return {
    // Database
    library: path.join(base, 'library.db'),

    // Per-game configs
    games: path.join(base, 'games'),

    // Runners (Wine/Proton) - bundled or downloaded
    runners: path.join(base, 'runners'),

    // XXMI Launcher + importers - bundled or downloaded
    xxmi: path.join(base, 'xxmi'),

    // Cache for downloads, patches
    cache: path.join(base, 'cache'),

    // App config
    config: path.join(base, 'config'),

    // Base for convenience
    base,
  }
}

// Type for paths (can be imported by other files)
export type AppPaths = ReturnType<typeof getPaths>

// Singleton instance - set after app is ready
let _paths: AppPaths | null = null

export function initPaths(): AppPaths {
  _paths = getPaths()

  // Ensure the managed app directories exist up front so packaged builds can
  // start cleanly without depending on a pre-seeded dev-data tree.
  fs.mkdirSync(_paths.base, { recursive: true })
  fs.mkdirSync(_paths.games, { recursive: true })
  fs.mkdirSync(_paths.runners, { recursive: true })
  fs.mkdirSync(_paths.xxmi, { recursive: true })
  fs.mkdirSync(_paths.cache, { recursive: true })
  fs.mkdirSync(_paths.config, { recursive: true })

  return _paths
}

export function getPathsInstance(): AppPaths {
  if (!_paths) {
    throw new Error('Paths not initialized. Call initPaths() first.')
  }
  return _paths
}
