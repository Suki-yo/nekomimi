// Path resolution - Node.js only
// This file uses Node APIs, so it can ONLY be imported in main process

import { app } from 'electron'
import * as path from 'path'
import { APP_NAME } from '../../shared/constants'

// Base directory for all app data
// In production: ~/.config/nekomimi
// In development: ./dev-data
const getBaseDir = (): string => {
  if (app.isPackaged) {
    return path.join(app.getPath('home'), '.config', APP_NAME)
  }
  return path.join(process.cwd(), 'dev-data')
}

// Resolved paths - call this after app is ready
export const getPaths = () => {
  const base = getBaseDir()

  return {
    // Config
    config: path.join(base, 'config.yml'),

    // Data
    library: path.join(base, 'library.db'),
    games: path.join(base, 'games'),
    runners: path.join(base, 'runners'),
    cache: path.join(base, 'cache'),
    mods: path.join(base, 'mods'),

    // Base for convenience
    base,
  }
}

// Type for paths (can be imported by other files)
export type AppPaths = ReturnType<typeof getPaths>
