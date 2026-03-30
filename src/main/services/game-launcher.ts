import { spawn, execSync } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { getGame, updateGame } from './database'
import { loadGameConfig, saveGameConfig } from './config'
import {
  getSteamCompatAppId,
  getUmuGameId as resolveUmuGameId,
  prepareGameForLaunch,
  resolvePreLaunchCommands,
  runPostBootstrapHooks,
  validateGameLaunchConfig,
} from './game-launch-hooks'
import { shouldUseXXMI, launchGameWithXXMI } from './mod-manager'
import { ProcessMonitor, type ProcessMonitorEntry } from './process-monitor'
import { findSteamrt, downloadSteamrt } from './steamrt'
import { expandHome } from './paths'
import { cleanupStandaloneWwmiRuntime } from './wuwa-mod-config'
import type { Game } from '../../shared/types/game'

function resolveProtonCompatPaths(prefixPath: string): { winePrefix: string; compatDataPath: string } {
  if (/\/pfx\/?$/.test(prefixPath)) {
    return {
      winePrefix: prefixPath,
      compatDataPath: prefixPath.replace(/\/pfx\/?$/, ''),
    }
  }

  const embeddedPrefix = join(prefixPath, 'pfx')
  if (existsSync(embeddedPrefix)) {
    return {
      winePrefix: embeddedPrefix,
      compatDataPath: prefixPath,
    }
  }

  return {
    winePrefix: prefixPath,
    compatDataPath: prefixPath,
  }
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

interface RunningGameMetadata {
  gameName: string
  configPath: string
  initialPlaytime: number
  postLaunch: string[]
  cleanupWwmiRuntime?: boolean
}

type RunningGame = ProcessMonitorEntry<RunningGameMetadata>

function finalizeRunningGame(gameId: string, running: RunningGame) {
  const completedAt = new Date().toISOString()
  const sessionPlaytime = (Date.now() - running.startTime) / 1000 / 60 / 60
  const totalPlaytime = running.metadata.initialPlaytime + sessionPlaytime

  console.log(`[launch] Finalizing session for ${running.metadata.gameName}`)

  updateGame(gameId, {
    playtime: totalPlaytime,
    last_played: completedAt,
  })

  const loadedGame = loadGameConfig(running.metadata.configPath)
  if (loadedGame) {
    loadedGame.playtime = totalPlaytime
    loadedGame.lastPlayed = completedAt
    saveGameConfig(loadedGame)
  }

  if (running.metadata.cleanupWwmiRuntime) {
    cleanupStandaloneWwmiRuntime(running.executablePath)
  }

  for (const cmd of running.metadata.postLaunch) {
    console.log(`[launch] Running post-launch: ${cmd}`)
    try {
      execSync(cmd, { stdio: 'inherit' })
    } catch {
      // Ignore post-launch errors
    }
  }

}

const processMonitor = new ProcessMonitor<RunningGameMetadata>(finalizeRunningGame)

function resolveRunnerPrefix(game: Game): string {
  const configuredPrefix = expandHome(game.runner.prefix)
  if (configuredPrefix) {
    return configuredPrefix
  }

  const generatedPrefix = join(homedir(), '.local', 'share', 'nekomimi', 'prefixes', game.slug, 'pfx')
  mkdirSync(generatedPrefix, { recursive: true })
  return generatedPrefix
}

function buildLaunchCommand(game: Game, useXXMI: boolean): { command: string; args: string[]; env: Record<string, string> } {
  // Resolve prefix: expand ~ and auto-generate if empty
  const prefix = resolveRunnerPrefix(game)

  const runnerPath = expandHome(game.runner.path)

  const env: Record<string, string> = {
    ...game.launch.env,
  }

  let command: string
  let args: string[]

  if (game.runner.type === 'proton') {
    const { winePrefix, compatDataPath } = resolveProtonCompatPaths(prefix)
    const steamrt = findSteamrt()
    const steamAppId = getSteamCompatAppId(game.slug)
    const shaderCache = join(compatDataPath, 'shadercache')
    mkdirSync(shaderCache, { recursive: true })
    env.SteamOS = '1'
    env.WINEPREFIX = winePrefix

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
      env.STEAM_COMPAT_APP_ID = steamAppId || '0'
      env.STEAM_COMPAT_CLIENT_INSTALL_PATH = ''
      env.STEAM_COMPAT_DATA_PATH = compatDataPath
      env.STEAM_COMPAT_INSTALL_PATH = game.directory
      env.STEAM_COMPAT_LIBRARY_PATHS = `${game.directory}:${winePrefix}`
      env.STEAM_COMPAT_SHADER_PATH = shaderCache
      env.STEAM_COMPAT_TOOL_PATHS = runnerPath
      env.STEAM_ZENITY = '/usr/bin/zenity'
      env.WINEARCH = 'win64'
    } else {
      // Fallback to umu-run if Steam Runtime not found
      command = 'umu-run'
      env.PROTONPATH = runnerPath
      env.GAMEID = resolveUmuGameId(game)
      if (steamAppId) {
        env.STEAM_COMPAT_APP_ID = steamAppId
      }
      env.STEAM_COMPAT_DATA_PATH = compatDataPath
      args = [game.executable]
    }
  } else if (game.runner.type === 'wine') {
    command = 'wine'
    env.WINEPREFIX = prefix
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

export async function launchGame(
  gameId: string,
  onProgress?: (step: string, percent: number) => void
): Promise<{ success: boolean; pid?: number; error?: string }> {
  processMonitor.cleanupStaleEntries()

  const gameRow = getGame(gameId)
  if (!gameRow) {
    return { success: false, error: 'Game not found' }
  }

  const loadedGame = loadGameConfig(gameRow.config_path)
  if (!loadedGame) {
    return { success: false, error: 'Game config not found' }
  }
  const game = loadedGame

  const standaloneConfigError = validateGameLaunchConfig(game)
  if (standaloneConfigError) {
    return { success: false, error: standaloneConfigError }
  }

  const exeName = game.executable.split(/[/\\]/).pop() || game.executable

  if (processMonitor.isProcessRunning({ exeName, executablePath: game.executable })) {
    console.log(`[launch] ${exeName} is already running`)
    return { success: false, error: 'Game is already running' }
  }

  const existing = processMonitor.get(gameId)
  if (existing) {
    console.log(`[launch] Cleaning up stale entry for ${exeName}`)
    processMonitor.delete(gameId)
    finalizeRunningGame(gameId, existing)
  }

  if (!game.executable || !game.runner?.path) {
    return { success: false, error: 'Game is missing required launch fields (executable or runner)' }
  }

  prepareGameForLaunch(game)

  // Resolve prefix: expand ~ and auto-generate if not set
  const resolvedPrefix = resolveRunnerPrefix(game)
  const resolvedRunnerPath = expandHome(game.runner.path)

  const gameSupportsXXMI = shouldUseXXMI(game.executable)
  const modsEnabled = game.mods?.enabled ?? false
  const useXXMI = gameSupportsXXMI && modsEnabled

  if (gameSupportsXXMI && !modsEnabled) {
    console.log(`[launch] Game supports mods but mods are disabled - launching vanilla`)
    if (game.mods?.importer === 'WWMI') {
      cleanupStandaloneWwmiRuntime(game.executable)
    }
  }

  for (const cmd of resolvePreLaunchCommands(game)) {
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

    runPostBootstrapHooks(game)

    processMonitor.set(gameId, {
      exeName,
      executablePath: game.executable,
      metadata: {
        gameName: game.name,
        configPath: gameRow.config_path,
        initialPlaytime: game.playtime,
        postLaunch: game.launch.postLaunch || [],
        cleanupWwmiRuntime: game.mods?.importer === 'WWMI',
      },
      launcherPid: loaderResult.pid,
      startTime,
      lastCheck: Date.now(),
    })

    return { success: true, pid: loaderResult.pid }
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

  runPostBootstrapHooks(game)

  processMonitor.set(gameId, {
    exeName,
    executablePath: game.executable,
    metadata: {
      gameName: game.name,
      configPath: gameRow.config_path,
      initialPlaytime: game.playtime,
      postLaunch: game.launch.postLaunch || [],
    },
    launcherPid: proc.pid,
    startTime,
    lastCheck: Date.now(),
  })

  proc.on('close', (code) => {
    console.log(`[launch] Launcher for ${game.name} exited with code ${code}`)
    processMonitor.cleanupStaleEntries()
  })

  proc.on('error', (err) => {
    console.error(`[launch] Process error:`, err)
    processMonitor.cleanupStaleEntries()
  })

  return { success: true, pid: proc.pid }
}

export function syncRunningGames(
  games: Array<{ id: string; configPath: string; game: Game }>
): void {
  processMonitor.sync(
    games
      .filter(({ game }) => !!game.executable)
      .map(({ id, configPath, game }) => ({
        id,
        exeName: game.executable.split(/[/\\]/).pop() || game.executable,
        executablePath: game.executable,
        metadata: {
          gameName: game.name,
          configPath,
          initialPlaytime: game.playtime,
          postLaunch: game.launch.postLaunch || [],
        },
      }))
  )
}

export function getRunningGames(): { id: string; startTime: number }[] {
  return processMonitor.getSessions()
}
