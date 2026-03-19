import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { saveGameConfig } from './config'
import { getPathsInstance } from './paths'
import type { Game } from '../../shared/types/game'

const TWINTAIL_BASE = path.join(os.homedir(), '.local', 'share', 'twintaillauncher')
const TWINTAIL_WUWA_PREFIXES = path.join(TWINTAIL_BASE, 'compatibility', 'prefixes', 'wuwa_global')
const TWINTAIL_RUNNERS = path.join(TWINTAIL_BASE, 'compatibility', 'runners')
const TWINTAIL_XXMI = path.join(TWINTAIL_BASE, 'extras', 'xxmi')

function isTwintailPath(value: string | undefined): boolean {
  return !!value && value.includes(`${path.sep}twintaillauncher${path.sep}`)
}

interface TwintailCompatSource {
  runnerPath: string
  prefixPath: string
}

function copyTreeIfNeeded(source: string, destination: string): void {
  if (!fs.existsSync(source)) return
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.cpSync(source, destination, {
    recursive: true,
    force: true,
    preserveTimestamps: true,
  })
}

function replaceInFile(filePath: string, replacements: Array<[string, string]>): void {
  if (!fs.existsSync(filePath)) return

  try {
    const original = fs.readFileSync(filePath, 'utf-8')
    let updated = original
    for (const [from, to] of replacements) {
      updated = updated.split(from).join(to)
    }
    if (updated !== original) {
      fs.writeFileSync(filePath, updated, 'utf-8')
    }
  } catch {
    // Ignore binary or unreadable files.
  }
}

function rewriteCopiedPrefix(prefixPath: string, replacements: Array<[string, string]>): void {
  const candidates = [
    'config_info',
    'tracked_files',
    'user.reg',
    'system.reg',
    'userdef.reg',
    path.join('pfx', 'user.reg'),
    path.join('pfx', 'system.reg'),
    path.join('pfx', 'userdef.reg'),
  ]

  for (const relPath of candidates) {
    replaceInFile(path.join(prefixPath, relPath), replacements)
  }

  const shortcutsDir = path.join(prefixPath, 'drive_c', 'proton_shortcuts')
  if (!fs.existsSync(shortcutsDir)) return

  for (const entry of fs.readdirSync(shortcutsDir)) {
    if (!entry.endsWith('.desktop')) continue
    replaceInFile(path.join(shortcutsDir, entry), replacements)
  }
}

function syncWwmiPayloadIfPresent(): void {
  const paths = getPathsInstance()
  if (!fs.existsSync(TWINTAIL_XXMI)) return

  const rootFiles = ['3dmloader.exe', 'd3d11.dll', 'd3dcompiler_47.dll']
  for (const fileName of rootFiles) {
    const source = path.join(TWINTAIL_XXMI, fileName)
    const destination = path.join(paths.xxmi, fileName)
    if (fs.existsSync(source)) {
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(source, destination)
    }
  }

  copyTreeIfNeeded(path.join(TWINTAIL_XXMI, 'wwmi'), path.join(paths.xxmi, 'WWMI'))
}

function buildLocalCompatPrefix(slug: string, sourcePrefix: string): string {
  const paths = getPathsInstance()
  return path.join(paths.base, 'compatibility', 'prefixes', slug, path.basename(sourcePrefix))
}

function getNewestDirectory(parentDir: string): string | null {
  if (!fs.existsSync(parentDir)) return null

  const candidates = fs.readdirSync(parentDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(parentDir, entry.name))
    .filter((entryPath) => fs.existsSync(path.join(entryPath, 'config_info')))

  if (candidates.length === 0) return null

  candidates.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
  return candidates[0]
}

function deriveRunnerPathFromPrefix(prefixPath: string): string | null {
  const configInfoPath = path.join(prefixPath, 'config_info')
  if (!fs.existsSync(configInfoPath)) return null

  const lines = fs.readFileSync(configInfoPath, 'utf-8').split(/\r?\n/)
  for (const line of lines) {
    if (!line.includes(`${path.sep}files${path.sep}`)) continue

    const normalized = line.trim()
    const fontsSuffix = `${path.sep}files${path.sep}share${path.sep}fonts${path.sep}`
    const libsSuffix = `${path.sep}files${path.sep}lib${path.sep}`

    if (normalized.endsWith(fontsSuffix)) {
      return normalized.slice(0, -fontsSuffix.length)
    }

    if (normalized.endsWith(libsSuffix)) {
      return normalized.slice(0, -libsSuffix.length)
    }
  }

  return null
}

function getNewestTwintailRunner(): string | null {
  if (!fs.existsSync(TWINTAIL_RUNNERS)) return null

  const candidates = fs.readdirSync(TWINTAIL_RUNNERS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'steamrt')
    .map((entry) => path.join(TWINTAIL_RUNNERS, entry.name))
    .filter((entryPath) => fs.existsSync(path.join(entryPath, 'proton')))

  if (candidates.length === 0) return null

  candidates.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
  return candidates[0]
}

function resolveTwintailWuwaCompat(game: Game): TwintailCompatSource | null {
  const livePrefix = getNewestDirectory(TWINTAIL_WUWA_PREFIXES)
  if (livePrefix) {
    const derivedRunner = deriveRunnerPathFromPrefix(livePrefix) || getNewestTwintailRunner()
    if (derivedRunner && fs.existsSync(derivedRunner)) {
      return {
        runnerPath: derivedRunner,
        prefixPath: livePrefix,
      }
    }
  }

  const sourceRunner = isTwintailPath(game.runner.path) ? game.runner.path : null
  const sourcePrefix = isTwintailPath(game.runner.prefix) ? game.runner.prefix : null
  if (sourceRunner && sourcePrefix) {
    return {
      runnerPath: sourceRunner,
      prefixPath: sourcePrefix,
    }
  }

  return null
}

export function syncGameFromTwintailIfNeeded(game: Game): Game {
  if (game.slug !== 'wuwa') return game
  if (!fs.existsSync(TWINTAIL_BASE)) return game

  const compatSource = resolveTwintailWuwaCompat(game)
  if (!compatSource) return game

  const { runnerPath: sourceRunner, prefixPath: sourcePrefix } = compatSource

  const paths = getPathsInstance()
  const localRunner = path.join(paths.runners, path.basename(sourceRunner))
  const localPrefix = buildLocalCompatPrefix(game.slug, sourcePrefix)

  const shouldSyncCompat =
    !fs.existsSync(localRunner) ||
    !fs.existsSync(localPrefix) ||
    game.runner.path !== localRunner ||
    game.runner.prefix !== localPrefix

  if (shouldSyncCompat) {
    console.log(`[twintail] Syncing WuWa compat from runner=${sourceRunner} prefix=${sourcePrefix}`)
    copyTreeIfNeeded(sourceRunner, localRunner)
    copyTreeIfNeeded(sourcePrefix, localPrefix)
  }

  syncWwmiPayloadIfPresent()

  if (shouldSyncCompat) {
    rewriteCopiedPrefix(localPrefix, [
      [sourceRunner, localRunner],
      [sourcePrefix, localPrefix],
      [TWINTAIL_XXMI, paths.xxmi],
      [TWINTAIL_BASE, paths.base],
    ])
  }

  const updatedGame: Game = {
    ...game,
    runner: {
      ...game.runner,
      path: localRunner,
      prefix: localPrefix,
    },
    launch: {
      ...game.launch,
      env: {
        ...game.launch.env,
        STEAM_COMPAT_CONFIG: 'noopwr,noxalia',
      },
    },
  }

  if (
    updatedGame.runner.path !== game.runner.path ||
    updatedGame.runner.prefix !== game.runner.prefix ||
    updatedGame.launch.env.STEAM_COMPAT_CONFIG !== game.launch.env.STEAM_COMPAT_CONFIG
  ) {
    console.log(`[twintail] Updated WuWa config to runner=${updatedGame.runner.path} prefix=${updatedGame.runner.prefix}`)
    saveGameConfig(updatedGame)
  }

  return updatedGame
}
