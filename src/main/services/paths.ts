// Path resolution - Node.js only
// This file uses Node APIs, so it can ONLY be imported in main process

import { app } from 'electron'
import * as path from 'path'
import { APP_NAME } from '../../shared/constants'

// Base directory for all app data
// Using .local/share for data (runners, xxmi are large)
// In production: ~/.local/share/nekomimi
// In development: ./dev-data
const getBaseDir = (): string => {
  if (app.isPackaged) {
    return path.join(app.getPath('home'), '.local', 'share', APP_NAME)
  }
  return path.join(process.cwd(), 'dev-data')
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
  return _paths
}

export function getPathsInstance(): AppPaths {
  if (!_paths) {
    throw new Error('Paths not initialized. Call initPaths() first.')
  }
  return _paths
}
