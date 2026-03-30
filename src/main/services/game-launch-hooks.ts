import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'
import { getPathsInstance } from './paths'
import type { Game } from '../../shared/types/game'

const GENSHIN_FPS_UNLOCK_SCRIPT_NAME = 'start-genshin-keqing.sh'
const DEFAULT_GENSHIN_FPS_UNLOCK_FPS = 200

const STEAM_APP_IDS: Partial<Record<Game['slug'], string>> = {
  wuwa: '3513350',
}

function isTwintailManagedPath(value: string | undefined): boolean {
  return !!value && value.includes('/twintaillauncher/')
}

function isGenshinGame(game: Game): boolean {
  return game.slug === 'genshinimpact' || game.executable.split(/[/\\]/).pop() === 'GenshinImpact.exe'
}

function isLegacyGenshinFpsUnlockCommand(command: string): boolean {
  const trimmed = command.trim()
  if (!trimmed) {
    return false
  }

  return basename(trimmed.split(/\s+/)[0]) === GENSHIN_FPS_UNLOCK_SCRIPT_NAME
}

function normalizeGenshinFps(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_GENSHIN_FPS_UNLOCK_FPS
  }

  return Math.max(30, Math.round(value as number))
}

function resolveGenshinFpsUnlockScriptPath(): string | null {
  const override = process.env.NEKOMIMI_GENSHIN_FPS_UNLOCK_SCRIPT
  const candidates = [
    override,
    join(getPathsInstance().base, 'fps_unlock', GENSHIN_FPS_UNLOCK_SCRIPT_NAME),
    join(process.resourcesPath, 'fps_unlock', GENSHIN_FPS_UNLOCK_SCRIPT_NAME),
    join(process.cwd(), 'dev-data', 'fps_unlock', GENSHIN_FPS_UNLOCK_SCRIPT_NAME),
  ]

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

function resolveGenshinFpsUnlockLaunch(game: Game): { scriptPath: string; fps: number } | null {
  if (!isGenshinGame(game)) {
    return null
  }

  const fpsUnlock = game.mods?.fpsUnlock
  if (fpsUnlock?.enabled === false) {
    return null
  }

  const scriptPath = resolveGenshinFpsUnlockScriptPath()
  if (!scriptPath) {
    console.warn('[launch] Genshin FPS unlocker script not found; skipping optional hook')
    return null
  }

  return {
    scriptPath,
    fps: normalizeGenshinFps(fpsUnlock?.fps),
  }
}

function validateStandaloneWuwaConfig(game: Game): string | null {
  if (game.slug !== 'wuwa') return null

  if (isTwintailManagedPath(game.runner.path)) {
    return 'WuWa runner still points at Twintail-managed storage. Move it to a nekomimi-managed runner before launching.'
  }

  if (isTwintailManagedPath(game.runner.prefix)) {
    return 'WuWa prefix still points at Twintail-managed storage. Move it to a nekomimi-managed prefix before launching.'
  }

  return null
}

function ensureSteamCompatMarkers(game: Game): void {
  const steamAppId = getSteamCompatAppId(game.slug)
  if (!steamAppId || game.slug !== 'wuwa') {
    return
  }

  const steamAppIdPath = join(game.directory, 'Client', 'Binaries', 'Win64', 'steam_appid.txt')
  if (!existsSync(steamAppIdPath)) {
    mkdirSync(dirname(steamAppIdPath), { recursive: true })
    writeFileSync(steamAppIdPath, `${steamAppId}\n`, 'utf-8')
  }
}

export function getSteamCompatAppId(slug: string): string | undefined {
  return STEAM_APP_IDS[slug]
}

export function getUmuGameId(game: Game): string {
  const configuredGameId = game.launch.env?.GAMEID
  if (configuredGameId) {
    return configuredGameId
  }

  const steamAppId = getSteamCompatAppId(game.slug)
  return steamAppId ? `umu-${steamAppId}` : '0'
}

export function validateGameLaunchConfig(game: Game): string | null {
  return validateStandaloneWuwaConfig(game)
}

export function prepareGameForLaunch(game: Game): void {
  ensureSteamCompatMarkers(game)
}

export function resolvePreLaunchCommands(game: Game): string[] {
  const commands = [...(game.launch.preLaunch || [])]
  if (!isGenshinGame(game)) {
    return commands
  }

  return commands.filter((command) => !isLegacyGenshinFpsUnlockCommand(command))
}

export function runPostBootstrapHooks(game: Game): void {
  const unlockLaunch = resolveGenshinFpsUnlockLaunch(game)
  if (!unlockLaunch) {
    return
  }

  console.log(`[launch] Starting Genshin FPS unlocker: ${unlockLaunch.scriptPath} ${unlockLaunch.fps}`)
  try {
    execFileSync(unlockLaunch.scriptPath, [String(unlockLaunch.fps)], { stdio: 'inherit' })
  } catch (error) {
    console.warn('[launch] Genshin FPS unlocker failed to start:', error)
  }
}
