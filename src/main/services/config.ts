// Config service - YAML file operations
// Handles app config and per-game configs

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'yaml'
import { getPathsInstance } from './paths'
import { DEFAULT_CONFIG } from '../../shared/constants'
import type { AppConfig, Game } from '../../shared/types'
import { normalizeWuwaGameConfig } from './wuwa-mod-config'

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
  const normalized = normalizeWuwaGameConfig(migrated.game)

  if (migrated.changed || normalized.changed) {
    saveGameConfig(normalized.game)
  }

  return normalized.game
}

export const saveGameConfig = (game: Game): void => {
  const paths = getPathsInstance()
  const gamesDir = paths.games

  // Ensure games directory exists
  fs.mkdirSync(gamesDir, { recursive: true })

  const configPath = path.join(gamesDir, `${game.slug}.yml`)
  const content = yaml.stringify(normalizeWuwaGameConfig(game).game)

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

const protonRunnerResolutionCache = new Map<string, string>()
const protonPrefixResolutionCache = new Map<string, string>()

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

interface ProtonRunnerCandidate {
  path: string
  name: string
  valid: boolean
}

function resolveValidProtonRunner(runnerPath: string): string {
  if (!runnerPath) {
    return runnerPath
  }

  const cached = protonRunnerResolutionCache.get(runnerPath)
  if (cached) {
    return cached
  }

  if (!fs.existsSync(runnerPath)) {
    protonRunnerResolutionCache.set(runnerPath, runnerPath)
    return runnerPath
  }

  const currentRunner = inspectProtonRunner(runnerPath)
  const resolvedRunner = currentRunner.valid
    ? runnerPath
    : findReplacementProtonRunner(currentRunner) || runnerPath

  protonRunnerResolutionCache.set(runnerPath, resolvedRunner)
  return resolvedRunner
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

  const cached = protonPrefixResolutionCache.get(normalizedPrefix)
  if (cached) {
    return cached
  }

  const currentPrefix = inspectProtonPrefix(normalizedPrefix)
  if (!currentPrefix || currentPrefix.valid) {
    protonPrefixResolutionCache.set(normalizedPrefix, normalizedPrefix)
    return normalizedPrefix
  }

  const replacement = findReplacementProtonPrefix(currentPrefix)
  const resolvedPrefix = replacement || normalizedPrefix
  protonPrefixResolutionCache.set(prefixPath, resolvedPrefix)
  protonPrefixResolutionCache.set(normalizedPrefix, resolvedPrefix)
  return resolvedPrefix
}

interface ProtonPrefixCandidate {
  path: string
  compatRoot: string
  mtimeMs: number
  valid: boolean
}

function inspectProtonRunner(runnerPath: string): ProtonRunnerCandidate {
  const protonScript = path.join(runnerPath, 'proton')
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

  return {
    path: runnerPath,
    name: path.basename(runnerPath).toLowerCase(),
    valid: fs.existsSync(protonScript) && requiredPaths.every((requiredPath) => fs.existsSync(requiredPath)),
  }
}

function findReplacementProtonRunner(brokenRunner: ProtonRunnerCandidate): string | null {
  const runnersDir = getPathsInstance().runners
  if (!fs.existsSync(runnersDir)) {
    return null
  }

  const familyHints = ['proton-cachyos', 'cachyos']
  const candidates = fs
    .readdirSync(runnersDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => inspectProtonRunner(path.join(runnersDir, entry.name)))
    .filter((candidate) => candidate.path !== brokenRunner.path && candidate.valid)

  const sameFamily = candidates.filter((candidate) =>
    familyHints.some((hint) => brokenRunner.name.includes(hint) && candidate.name.includes(hint))
  )
  const pool = sameFamily.length > 0 ? sameFamily : candidates
  pool.sort((a, b) => path.basename(b.path).localeCompare(path.basename(a.path)))
  return pool[0]?.path || null
}

function inspectProtonPrefix(prefixPath: string): ProtonPrefixCandidate | null {
  if (!prefixPath || !fs.existsSync(prefixPath)) {
    return null
  }

  const compatRoot = prefixPath.replace(/\/pfx\/?$/, '')
  const steamExe = path.join(prefixPath, 'drive_c', 'windows', 'system32', 'steam.exe')
  let valid = fs.existsSync(steamExe)

  const cDrive = path.join(prefixPath, 'dosdevices', 'c:')
  try {
    const resolvedCDrive = fs.realpathSync.native(cDrive)
    const localDrive = fs.realpathSync.native(path.join(prefixPath, 'drive_c'))
    valid = valid && resolvedCDrive === localDrive && !resolvedCDrive.includes(`${path.sep}twintaillauncher${path.sep}`)
  } catch {
    valid = false
  }

  return {
    path: prefixPath,
    compatRoot,
    mtimeMs: fs.statSync(compatRoot).mtimeMs,
    valid,
  }
}

function findReplacementProtonPrefix(brokenPrefix: ProtonPrefixCandidate): string | null {
  const prefixesDir = path.dirname(brokenPrefix.compatRoot)
  if (!fs.existsSync(prefixesDir)) {
    return null
  }

  const candidates = fs
    .readdirSync(prefixesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => normalizeProtonPrefixPath(path.join(prefixesDir, entry.name)))
    .filter((candidatePath) => candidatePath !== brokenPrefix.path)
    .map((candidatePath) => inspectProtonPrefix(candidatePath))
    .filter((candidate): candidate is ProtonPrefixCandidate => candidate !== null && candidate.valid)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)

  return candidates[0]?.path || null
}
