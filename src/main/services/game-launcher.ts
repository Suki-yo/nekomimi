import { spawn, execSync } from 'child_process'
import { getGame, updateGame } from './database'
import { loadGameConfig, saveGameConfig } from './config'
import { shouldUseXXMI, launchGameWithXXMI } from './mod-manager'
import type { Game } from '../../shared/types/game'

interface RunningGame {
  exeName: string
  launcherPid?: number
  startTime: number
  lastCheck: number
}

const runningProcesses = new Map<string, RunningGame>()
const POLL_INTERVAL = 5000

function isProcessRunning(exeName: string): boolean {
  try {
    const result = execSync(`pgrep -f "${exeName}"`, { stdio: 'pipe' })
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
  const env: Record<string, string> = {
    WINEPREFIX: game.runner.prefix,
    ...game.launch.env,
  }

  let command: string
  let args: string[]

  if (game.runner.type === 'proton') {
    command = 'umu-run'
    env.PROTONPATH = game.runner.path
    args = [game.executable]
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
    args = args.concat(game.launch.args.split(' ').filter(Boolean))
  }

  return { command, args, env }
}

export async function launchGame(gameId: string): Promise<{ success: boolean; pid?: number; error?: string }> {
  startPolling()
  cleanupStaleEntries()

  const gameRow = getGame(gameId)
  if (!gameRow) {
    return { success: false, error: 'Game not found' }
  }

  const game = loadGameConfig(gameRow.config_path)
  if (!game) {
    return { success: false, error: 'Game config not found' }
  }

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

  if (!game.executable || !game.runner?.path || !game.runner?.prefix) {
    return { success: false, error: 'Game is missing required launch fields' }
  }

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
      game.runner.path,
      game.runner.prefix
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

  const { command, args, env } = buildLaunchCommand(game, false)

  console.log(`[launch] Launching ${game.name}: ${command} ${args.join(' ')}`)

  const proc = spawn(command, args, {
    env: { ...process.env, ...env },
    detached: true,
    stdio: 'ignore',
  })

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
