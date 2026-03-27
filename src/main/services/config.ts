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
  const parsed = yaml.parse(content) as Game
  const migrated = migrateGamePaths(parsed)

  if (migrated.changed) {
    saveGameConfig(migrated.game)
  }

  return migrated.game
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

function migrateGamePaths(game: Game): { game: Game; changed: boolean } {
  const remappedRunnerPath = remapManagedPath(game.runner.path)
  const updatedRunnerPath =
    game.runner.type === 'proton'
      ? resolveValidProtonRunner(remappedRunnerPath)
      : remappedRunnerPath
  const remappedRunnerPrefix = remapManagedPath(game.runner.prefix)
  const updatedRunnerPrefix =
    game.runner.type === 'proton'
      ? resolveValidProtonPrefix(remappedRunnerPrefix)
      : remappedRunnerPrefix
  const updatedCoverImage = game.coverImage ? remapManagedPath(game.coverImage) : game.coverImage

  const changed =
    updatedRunnerPath !== game.runner.path ||
    updatedRunnerPrefix !== game.runner.prefix ||
    updatedCoverImage !== game.coverImage

  if (!changed) {
    return { game, changed: false }
  }

  return {
    changed: true,
    game: {
      ...game,
      runner: {
        ...game.runner,
        path: updatedRunnerPath,
        prefix: updatedRunnerPrefix,
      },
      coverImage: updatedCoverImage,
    },
  }
}

function remapManagedPath(value: string): string {
  if (!value || fs.existsSync(value)) {
    return value
  }

  const marker = `${path.sep}dev-data${path.sep}`
  const markerIndex = value.lastIndexOf(marker)
  if (markerIndex === -1) {
    return value
  }

  const suffix = value.slice(markerIndex + marker.length)
  const remapped = path.join(getPathsInstance().base, suffix)
  return fs.existsSync(remapped) ? remapped : value
}

function resolveValidProtonRunner(runnerPath: string): string {
  if (!runnerPath) {
    return runnerPath
  }

  if (!isBrokenProtonRunner(runnerPath)) {
    return runnerPath
  }

  const replacement = findReplacementProtonRunner(runnerPath)
  if (replacement) {
    return replacement
  }

  return runnerPath
}

function normalizeProtonPrefixPath(prefixPath: string): string {
  if (!prefixPath) {
    return prefixPath
  }

  if (/\/pfx\/?$/.test(prefixPath)) {
    return prefixPath
  }

  const embeddedPrefix = path.join(prefixPath, 'pfx')
  try {
    return fs.statSync(embeddedPrefix).isDirectory() ? embeddedPrefix : prefixPath
  } catch {
    return prefixPath
  }
}

function resolveValidProtonPrefix(prefixPath: string): string {
  const normalizedPrefix = normalizeProtonPrefixPath(prefixPath)
  if (!normalizedPrefix) {
    return normalizedPrefix
  }

  if (!isBrokenProtonPrefix(normalizedPrefix)) {
    return normalizedPrefix
  }

  const replacement = findReplacementProtonPrefix(normalizedPrefix)
  return replacement || normalizedPrefix
}

function isBrokenProtonPrefix(prefixPath: string): boolean {
  if (!prefixPath || !fs.existsSync(prefixPath)) {
    return false
  }

  const steamExe = path.join(prefixPath, 'drive_c', 'windows', 'system32', 'steam.exe')
  if (!fs.existsSync(steamExe)) {
    return true
  }

  const cDrive = path.join(prefixPath, 'dosdevices', 'c:')
  try {
    const resolvedCDrive = fs.realpathSync.native(cDrive)
    const localDrive = fs.realpathSync.native(path.join(prefixPath, 'drive_c'))
    return resolvedCDrive !== localDrive || resolvedCDrive.includes(`${path.sep}twintaillauncher${path.sep}`)
  } catch {
    return true
  }
}

function findReplacementProtonPrefix(brokenPrefixPath: string): string | null {
  const compatRoot = brokenPrefixPath.replace(/\/pfx\/?$/, '')
  const prefixesDir = path.dirname(compatRoot)
  if (!fs.existsSync(prefixesDir)) {
    return null
  }

  const candidates = fs
    .readdirSync(prefixesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => normalizeProtonPrefixPath(path.join(prefixesDir, entry.name)))
    .filter((candidatePath) => candidatePath !== brokenPrefixPath)
    .filter((candidatePath) => fs.existsSync(candidatePath))
    .filter((candidatePath) => !isBrokenProtonPrefix(candidatePath))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)

  return candidates[0] || null
}

function isBrokenProtonRunner(runnerPath: string): boolean {
  if (!runnerPath || !fs.existsSync(runnerPath)) {
    return false
  }

  const protonScript = path.join(runnerPath, 'proton')
  if (!fs.existsSync(protonScript)) {
    return true
  }

  const requiredPaths = [
    path.join(runnerPath, 'files', 'share', 'default_pfx', 'drive_c', 'windows', 'system32', 'd3d8.dll'),
    path.join(
      runnerPath,
      'files',
      'share',
      'default_pfx',
      'drive_c',
      'Program Files (x86)',
      'Windows NT',
      'Accessories',
      'wordpad.exe'
    ),
  ]

  return requiredPaths.some((requiredPath) => !fs.existsSync(requiredPath))
}

function findReplacementProtonRunner(brokenRunnerPath: string): string | null {
  const runnersDir = getPathsInstance().runners
  if (!fs.existsSync(runnersDir)) {
    return null
  }

  const brokenName = path.basename(brokenRunnerPath).toLowerCase()
  const familyHints = ['proton-cachyos', 'cachyos']
  const entries = fs
    .readdirSync(runnersDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(runnersDir, entry.name))
    .filter((candidatePath) => candidatePath !== brokenRunnerPath)
    .filter((candidatePath) => fs.existsSync(path.join(candidatePath, 'proton')))
    .filter((candidatePath) => !isBrokenProtonRunner(candidatePath))

  const sameFamily = entries.filter((candidatePath) => {
    const candidateName = path.basename(candidatePath).toLowerCase()
    return familyHints.some((hint) => brokenName.includes(hint) && candidateName.includes(hint))
  })

  const candidates = (sameFamily.length > 0 ? sameFamily : entries).sort((a, b) =>
    path.basename(b).localeCompare(path.basename(a))
  )

  return candidates[0] || null
}
