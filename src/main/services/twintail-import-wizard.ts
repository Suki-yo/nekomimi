import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { getGames } from './database'
import { loadGameConfig, saveGameConfig } from './config'
import { getPathsInstance } from './paths'
import type { Game } from '../../shared/types/game'
import type {
  TwintailImportOptions,
  TwintailImportResult,
  TwintailImportStatus,
} from '../../shared/types/twintail'

const TWINTAIL_BASE = path.join(os.homedir(), '.local', 'share', 'twintaillauncher')
const TWINTAIL_WUWA_PREFIXES = path.join(TWINTAIL_BASE, 'compatibility', 'prefixes', 'wuwa_global')
const TWINTAIL_RUNNERS = path.join(TWINTAIL_BASE, 'compatibility', 'runners')
const TWINTAIL_XXMI = path.join(TWINTAIL_BASE, 'extras', 'xxmi')

function copyTree(source: string, destination: string): void {
  const stat = fs.statSync(source)

  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true })
    for (const entry of fs.readdirSync(source)) {
      fs.cpSync(path.join(source, entry), path.join(destination, entry), {
        recursive: true,
        force: true,
        preserveTimestamps: true,
      })
    }
    return
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.cpSync(source, destination, {
    recursive: false,
    force: true,
    preserveTimestamps: true,
  })
}

function replaceInFile(filePath: string, replacements: Array<[string, string]>): void {
  if (!fs.existsSync(filePath)) {
    return
  }

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
  if (!fs.existsSync(shortcutsDir)) {
    return
  }

  for (const entry of fs.readdirSync(shortcutsDir)) {
    if (entry.endsWith('.desktop')) {
      replaceInFile(path.join(shortcutsDir, entry), replacements)
    }
  }
}

function getNewestDirectory(parentDir: string): string | null {
  if (!fs.existsSync(parentDir)) {
    return null
  }

  const candidates = fs.readdirSync(parentDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(parentDir, entry.name))
    .filter((entryPath) => fs.existsSync(path.join(entryPath, 'config_info')))

  if (candidates.length === 0) {
    return null
  }

  candidates.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
  return candidates[0]
}

function deriveRunnerPathFromPrefix(prefixPath: string): string | null {
  const configInfoPath = path.join(prefixPath, 'config_info')
  if (!fs.existsSync(configInfoPath)) {
    return null
  }

  const lines = fs.readFileSync(configInfoPath, 'utf-8').split(/\r?\n/)
  for (const line of lines) {
    if (!line.includes(`${path.sep}files${path.sep}`)) {
      continue
    }

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

function getNewestLocalRunner(): string | null {
  const { runners } = getPathsInstance()
  if (!fs.existsSync(runners)) {
    return null
  }

  const candidates = fs.readdirSync(runners, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'steamrt')
    .map((entry) => path.join(runners, entry.name))
    .filter((entryPath) => fs.existsSync(path.join(entryPath, 'proton')))

  if (candidates.length === 0) {
    return null
  }

  candidates.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
  return candidates[0]
}

function getLocalWuwaPrefixesRoot(): string {
  return path.join(getPathsInstance().base, 'compatibility', 'prefixes', 'wuwa')
}

function getImportedWuwaCompat(): { runnerPath: string; prefixPath: string } | null {
  const localPrefix = getNewestDirectory(getLocalWuwaPrefixesRoot())
  if (!localPrefix) {
    return null
  }

  const derivedRunner = deriveRunnerPathFromPrefix(localPrefix) || getNewestLocalRunner()
  if (!derivedRunner || !fs.existsSync(derivedRunner)) {
    return null
  }

  return {
    runnerPath: derivedRunner,
    prefixPath: localPrefix,
  }
}

function updateImportedWuwaConfigs(): number {
  const compat = getImportedWuwaCompat()
  if (!compat) {
    return 0
  }

  let updatedCount = 0

  for (const row of getGames()) {
    const game = loadGameConfig(row.config_path)
    if (!game || game.slug !== 'wuwa') {
      continue
    }

    const updatedGame: Game = {
      ...game,
      runner: {
        ...game.runner,
        path: compat.runnerPath,
        prefix: compat.prefixPath,
      },
      launch: {
        ...game.launch,
        env: {
          ...game.launch.env,
          STEAM_COMPAT_CONFIG: 'noopwr,noxalia',
        },
      },
    }

    const changed =
      updatedGame.runner.path !== game.runner.path
      || updatedGame.runner.prefix !== game.runner.prefix
      || updatedGame.launch.env.STEAM_COMPAT_CONFIG !== game.launch.env.STEAM_COMPAT_CONFIG

    if (changed) {
      saveGameConfig(updatedGame)
      updatedCount += 1
    }
  }

  return updatedCount
}

export function detectTwintailInstallation(): TwintailImportStatus {
  return {
    twintailInstalled: fs.existsSync(TWINTAIL_BASE),
    wuwaPrefixPath: fs.existsSync(TWINTAIL_WUWA_PREFIXES) ? TWINTAIL_WUWA_PREFIXES : null,
    runnersPath: fs.existsSync(TWINTAIL_RUNNERS) ? TWINTAIL_RUNNERS : null,
    xxmiPath: fs.existsSync(TWINTAIL_XXMI) ? TWINTAIL_XXMI : null,
  }
}

export async function importFromTwintail(options: TwintailImportOptions): Promise<TwintailImportResult> {
  const status = detectTwintailInstallation()
  const imported: string[] = []
  const skipped: string[] = []

  if (!status.twintailInstalled) {
    return {
      ok: false,
      imported,
      skipped: ['runners', 'wuwa-prefix', 'xxmi'],
      error: 'TwintailLauncher was not detected on this system.',
    }
  }

  try {
    const paths = getPathsInstance()

    if (options.importRunners && status.runnersPath) {
      copyTree(status.runnersPath, paths.runners)
      imported.push('runners')
    } else {
      skipped.push('runners')
    }

    if (options.importWuwaPrefix && status.wuwaPrefixPath) {
      const localPrefixRoot = getLocalWuwaPrefixesRoot()
      copyTree(status.wuwaPrefixPath, localPrefixRoot)

      const replacements: Array<[string, string]> = [
        [TWINTAIL_RUNNERS, paths.runners],
        [status.wuwaPrefixPath, localPrefixRoot],
        [TWINTAIL_XXMI, paths.xxmi],
        [TWINTAIL_BASE, paths.base],
      ]

      for (const entry of fs.readdirSync(localPrefixRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          continue
        }

        rewriteCopiedPrefix(path.join(localPrefixRoot, entry.name), replacements)
      }

      imported.push('wuwa-prefix')
    } else {
      skipped.push('wuwa-prefix')
    }

    if (options.importXxmi && status.xxmiPath) {
      copyTree(status.xxmiPath, paths.xxmi)
      imported.push('xxmi')
    } else {
      skipped.push('xxmi')
    }

    const updatedConfigs = updateImportedWuwaConfigs()
    if (updatedConfigs > 0) {
      imported.push(`wuwa-config:${updatedConfigs}`)
    }

    return {
      ok: imported.length > 0,
      imported,
      skipped,
    }
  } catch (error) {
    return {
      ok: false,
      imported,
      skipped,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
