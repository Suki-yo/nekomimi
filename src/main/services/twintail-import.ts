import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { saveGameConfig } from './config'
import { getPathsInstance } from './paths'
import type { Game } from '../../shared/types/game'

const TWINTAIL_BASE = path.join(os.homedir(), '.local', 'share', 'twintaillauncher')

function isTwintailPath(value: string | undefined): boolean {
  return !!value && value.includes(`${path.sep}twintaillauncher${path.sep}`)
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
  const twintailXxmi = path.join(TWINTAIL_BASE, 'extras', 'xxmi')
  if (!fs.existsSync(twintailXxmi)) return

  const rootFiles = ['3dmloader.exe', 'd3d11.dll', 'd3dcompiler_47.dll']
  for (const fileName of rootFiles) {
    const source = path.join(twintailXxmi, fileName)
    const destination = path.join(paths.xxmi, fileName)
    if (fs.existsSync(source)) {
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(source, destination)
    }
  }

  copyTreeIfNeeded(path.join(twintailXxmi, 'wwmi'), path.join(paths.xxmi, 'WWMI'))
}

function buildLocalCompatPrefix(slug: string, sourcePrefix: string): string {
  const paths = getPathsInstance()
  return path.join(paths.base, 'compatibility', 'prefixes', slug, path.basename(sourcePrefix))
}

export function syncGameFromTwintailIfNeeded(game: Game): Game {
  if (game.slug !== 'wuwa') return game
  if (!fs.existsSync(TWINTAIL_BASE)) return game

  const sourceRunner = isTwintailPath(game.runner.path) ? game.runner.path : null
  const sourcePrefix = isTwintailPath(game.runner.prefix) ? game.runner.prefix : null
  if (!sourceRunner || !sourcePrefix) return game

  const paths = getPathsInstance()
  const localRunner = path.join(paths.runners, path.basename(sourceRunner))
  const localPrefix = buildLocalCompatPrefix(game.slug, sourcePrefix)

  copyTreeIfNeeded(sourceRunner, localRunner)
  copyTreeIfNeeded(sourcePrefix, localPrefix)
  syncWwmiPayloadIfPresent()

  rewriteCopiedPrefix(localPrefix, [
    [sourceRunner, localRunner],
    [sourcePrefix, localPrefix],
    [path.join(TWINTAIL_BASE, 'extras', 'xxmi'), paths.xxmi],
    [TWINTAIL_BASE, paths.base],
  ])

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
    saveGameConfig(updatedGame)
  }

  return updatedGame
}
