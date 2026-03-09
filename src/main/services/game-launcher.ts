import { spawn, execSync } from 'child_process'
import { mkdirSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { getGame, updateGame } from './database'
import { loadGameConfig, saveGameConfig } from './config'
import { shouldUseXXMI, launchGameWithXXMI } from './mod-manager'
import { findSteamrt, downloadSteamrt } from './steamrt'
import { syncGameFromTwintailIfNeeded } from './twintail-import'
import type { Game } from '../../shared/types/game'

function expandHome(p: string): string {
  return p.startsWith('~/') ? join(homedir(), p.slice(2)) : p
}

function shellSplit(input: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: string | null = null
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null
      else current += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === ' ') {
      if (current) { args.push(current); current = '' }
    } else {
      current += ch
    }
  }
  if (current) args.push(current)
  return args
}

interface RunningGame {
  exeName: string
  launcherPid?: number
  startTime: number
  lastCheck: number
}

const STEAM_APP_IDS: Record<string, string> = {
  wuwa: '3513350',
}

const runningProcesses = new Map<string, RunningGame>()
const POLL_INTERVAL = 5000

function isProcessRunning(exeName: string): boolean {
  if (!exeName) return false
  try {
    const result = execSync(`pgrep -fi "${exeName}"`, { stdio: 'pipe' })
    return result.toString().trim().length > 0
  } catch {
    return false
  }
}

function cleanupStaleEntries() {
  const now = Date.now()

  for (const [gameId, running] of runningProcesses.entries()) {
    if (!isProcessRunning(running.exeName)) {
      console.log(`[launch] Cleaning up stale entry for ${running.exeName}`)
      runningProcesses.delete(gameId)
    } else {
      running.lastCheck = now
    }
  }
}

let pollInterval: NodeJS.Timeout | null = null

function startPolling() {
  if (pollInterval) return
  pollInterval = setInterval(cleanupStaleEntries, POLL_INTERVAL)
}

startPolling()

function buildLaunchCommand(game: Game, useXXMI: boolean): { command: string; args: string[]; env: Record<string, string> } {
  // Resolve prefix: expand ~ and auto-generate if empty
  let prefix = expandHome(game.runner.prefix)
  if (!prefix) {
    prefix = join(homedir(), '.local', 'share', 'nekomimi', 'prefixes', game.slug, 'pfx')
    mkdirSync(prefix, { recursive: true })
  }

  const runnerPath = expandHome(game.runner.path)

  const env: Record<string, string> = {
    WINEPREFIX: prefix,
    ...game.launch.env,
  }

  let command: string
  let args: string[]

  if (game.runner.type === 'proton') {
    const steamrt = findSteamrt()
    const prefixParent = prefix.replace(/\/pfx\/?$/, '')
    const shaderCache = join(prefixParent, 'shadercache')
    mkdirSync(shaderCache, { recursive: true })

    if (steamrt) {
      // Use Steam Runtime (pressure-vessel) + proton script directly — matches Twintail's approach
      command = join(steamrt, '_v2-entry-point')
      args = [
        '--verb=waitforexitandrun', '--',
        join(runnerPath, 'proton'),
        'waitforexitandrun',
        'z:\\' + game.executable,
      ]
      env.PROTONFIXES_DISABLE = '1'
      env.STEAM_COMPAT_APP_ID = STEAM_APP_IDS[game.slug] || '0'
      env.STEAM_COMPAT_CLIENT_INSTALL_PATH = ''
      env.STEAM_COMPAT_DATA_PATH = prefixParent
      env.STEAM_COMPAT_INSTALL_PATH = game.directory
      env.STEAM_COMPAT_LIBRARY_PATHS = `${game.directory}:${prefix}`
      env.STEAM_COMPAT_SHADER_PATH = shaderCache
      env.STEAM_COMPAT_TOOL_PATHS = runnerPath
      env.STEAM_ZENITY = '/usr/bin/zenity'
      env.WINEARCH = 'win64'
      env.WINEPREFIX = prefix
    } else {
      // Fallback to umu-run if Steam Runtime not found
      command = 'umu-run'
      env.PROTONPATH = runnerPath
      env.GAMEID = game.launch.env?.GAMEID || (game.slug === 'wuwa' ? 'umu-3513350' : '0')
      if (game.slug === 'wuwa') {
        env.STEAM_COMPAT_APP_ID = STEAM_APP_IDS[game.slug]
      }
      env.STEAM_COMPAT_DATA_PATH = prefixParent
      args = [game.executable]
    }
  } else if (game.runner.type === 'wine') {
    command = 'wine'
    args = [game.executable]
  } else {
    command = game.executable
    args = []
  }

  if (useXXMI) {
    const existingOverrides = env.WINEDLLOVERRIDES || ''
    env.WINEDLLOVERRIDES = existingOverrides
      ? `d3d11=n;${existingOverrides}`
      : 'd3d11=n'
  }

  if (game.launch.args) {
    args = args.concat(shellSplit(game.launch.args))
  }

  return { command, args, env }
}

function ensureSteamCompatMarkers(game: Game): void {
  if (game.slug !== 'wuwa') return

  const steamAppIdPath = join(game.directory, 'Client', 'Binaries', 'Win64', 'steam_appid.txt')
  if (!existsSync(steamAppIdPath)) {
    writeFileSync(steamAppIdPath, `${STEAM_APP_IDS.wuwa}\n`, 'utf-8')
  }
}

export async function launchGame(
  gameId: string,
  onProgress?: (step: string, percent: number) => void
): Promise<{ success: boolean; pid?: number; error?: string }> {
  startPolling()
  cleanupStaleEntries()

  const gameRow = getGame(gameId)
  if (!gameRow) {
    return { success: false, error: 'Game not found' }
  }

  const loadedGame = loadGameConfig(gameRow.config_path)
  if (!loadedGame) {
    return { success: false, error: 'Game config not found' }
  }
  const game = syncGameFromTwintailIfNeeded(loadedGame)

  const exeName = game.executable.split(/[/\\]/).pop() || game.executable

  if (isProcessRunning(exeName)) {
    console.log(`[launch] ${exeName} is already running`)
    return { success: false, error: 'Game is already running' }
  }

  const existing = runningProcesses.get(gameId)
  if (existing) {
    console.log(`[launch] Cleaning up stale entry for ${exeName}`)
    runningProcesses.delete(gameId)
  }

  if (!game.executable || !game.runner?.path) {
    return { success: false, error: 'Game is missing required launch fields (executable or runner)' }
  }

  ensureSteamCompatMarkers(game)

  // Resolve prefix: expand ~ and auto-generate if not set
  const resolvedPrefix = (() => {
    const p = expandHome(game.runner.prefix)
    if (p) return p
    const auto = join(homedir(), '.local', 'share', 'nekomimi', 'prefixes', game.slug, 'pfx')
    mkdirSync(auto, { recursive: true })
    return auto
  })()
  const resolvedRunnerPath = expandHome(game.runner.path)

  const gameSupportsXXMI = shouldUseXXMI(game.executable)
  const modsEnabled = game.mods?.enabled ?? false
  const useXXMI = gameSupportsXXMI && modsEnabled

  if (gameSupportsXXMI && !modsEnabled) {
    console.log(`[launch] Game supports mods but mods are disabled - launching vanilla`)
  }

  for (const cmd of game.launch.preLaunch || []) {
    console.log(`[launch] Running pre-launch: ${cmd}`)
    try {
      execSync(cmd, { stdio: 'inherit' })
    } catch {
      return { success: false, error: `Pre-launch command failed: ${cmd}` }
    }
  }

  const startTime = Date.now()

  if (useXXMI) {
    console.log(`[launch] Using XXMI mode for ${exeName}`)

    const loaderResult = await launchGameWithXXMI(
      game.executable,
      game.directory,
      resolvedRunnerPath,
      resolvedPrefix,
      game.launch.env || {}
    )

    if (!loaderResult.success) {
      return { success: false, error: loaderResult.error }
    }

    runningProcesses.set(gameId, {
      exeName,
      startTime,
      lastCheck: Date.now(),
    })

    return { success: true }
  }

  // Auto-install Steam Runtime if needed for proton games
  if (game.runner.type === 'proton' && !findSteamrt()) {
    console.log('[launch] Steam Runtime not found, downloading...')
    onProgress?.('Installing Steam Runtime', 0)
    const result = await downloadSteamrt((percent) => onProgress?.('Installing Steam Runtime', percent))
    if (!result.success) {
      return { success: false, error: `Failed to install Steam Runtime: ${result.error}` }
    }
  }

  const { command, args, env } = buildLaunchCommand(game, false)

  console.log(`[launch] Launching ${game.name}: ${command} ${args.join(' ')}`)

  const proc = spawn(command, args, {
    env: { ...process.env, ...env },
    cwd: game.directory,
    detached: true,
    stdio: 'ignore',
  })

  // Unref the process so the parent doesn't wait for it and can exit cleanly
  // This prevents the launcher process from becoming a zombie
  proc.unref()

  runningProcesses.set(gameId, {
    exeName,
    launcherPid: proc.pid,
    startTime,
    lastCheck: Date.now(),
  })

  proc.on('close', (code) => {
    console.log(`[launch] Launcher for ${game.name} exited with code ${code}`)

    const sessionPlaytime = (Date.now() - startTime) / 1000 / 60 / 60

    updateGame(gameId, {
      playtime: game.playtime + sessionPlaytime,
      last_played: new Date().toISOString(),
    })

    game.playtime = game.playtime + sessionPlaytime
    game.lastPlayed = new Date().toISOString()
    saveGameConfig(game)

    for (const cmd of game.launch.postLaunch || []) {
      console.log(`[launch] Running post-launch: ${cmd}`)
      try {
        execSync(cmd, { stdio: 'inherit' })
      } catch {
        // Ignore post-launch errors
      }
    }

    runningProcesses.delete(gameId)
  })

  proc.on('error', (err) => {
    console.error(`[launch] Process error:`, err)
    runningProcesses.delete(gameId)
  })

  return { success: true, pid: proc.pid }
}

export function getRunningGames(): { id: string; startTime: number }[] {
  return Array.from(runningProcesses.entries()).map(([id, data]) => ({
    id,
    startTime: data.startTime,
  }))
}
