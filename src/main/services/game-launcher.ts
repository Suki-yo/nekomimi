import { spawn, execSync } from 'child_process'
import { getGame, updateGame } from './database'
import { loadGameConfig, saveGameConfig } from './config'
import { shouldUseXXMI, launchGameWithXXMI } from './mod-manager'
import type { Game } from '../../shared/types/game'

// Track running game processes
const runningProcesses = new Map<string, { process: ReturnType<typeof spawn>, startTime: number }>()

// Build the launch command and environment
function buildLaunchCommand(game: Game, useXXMI: boolean = false): { command: string; args: string[]; env: Record<string, string> } {
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
    // Native - run directly
    command = game.executable
    args = []
  }

  // When using XXMI, force native d3d11.dll (3DMigoto) instead of Wine's
  if (useXXMI) {
    const existingOverrides = env.WINEDLLOVERRIDES || ''
    env.WINEDLLOVERRIDES = existingOverrides
      ? `d3d11=n;${existingOverrides}`
      : 'd3d11=n'
  }

  // Append custom launch args
  if (game.launch.args) {
    args = args.concat(game.launch.args.split(' ').filter(Boolean))
  }

  return { command, args, env }
}

export async function launchGame(gameId: string): Promise<{ success: boolean; pid?: number; error?: string }> {
  // Check if already running - verify process is actually alive
  const existing = runningProcesses.get(gameId)
  if (existing) {
    // For XXMI launches, process is null - check if it's been running less than 30 seconds
    if (!existing.process) {
      const elapsed = (Date.now() - existing.startTime) / 1000
      if (elapsed < 30) {
        return { success: false, error: 'Game is already starting up' }
      }
      // Stale entry, clear it
      runningProcesses.delete(gameId)
    } else if (existing.process.pid) {
      // Normal launch - check if process is still alive
      try {
        process.kill(existing.process.pid, 0)
        return { success: false, error: 'Game is already running' }
      } catch {
        // Process is dead, clear stale entry
        runningProcesses.delete(gameId)
      }
    }
  }

  // Fetch game row from database
  const gameRow = getGame(gameId)
  if (!gameRow) {
    return { success: false, error: 'Game not found' }
  }

  // Load full game config from YAML
  const game = loadGameConfig(gameRow.config_path)
  if (!game) {
    return { success: false, error: 'Game config not found' }
  }

  // Validate required fields
  if (!game.executable || !game.runner?.path || !game.runner?.prefix) {
    return { success: false, error: 'Game is missing required launch fields' }
  }

  // Check if XXMI should be used for this game (hardcoded for Endfield)
  const useXXMI = shouldUseXXMI(game.executable)

  // Run pre-launch commands
  for (const cmd of game.launch.preLaunch || []) {
    console.log(`[launch] Running pre-launch: ${cmd}`)
    try {
      execSync(cmd, { stdio: 'inherit' })
    } catch (err) {
      return { success: false, error: `Pre-launch command failed: ${cmd}` }
    }
  }

  // XXMI mode: Launch via XXMI Launcher with --nogui flag
  // XXMI auto-launches the game with mod injection
  if (useXXMI) {
    console.log(`[launch] Using XXMI mode - game will launch with mods`)

    const startTime = Date.now()

    // Launch XXMI Launcher through Lutris
    const loaderResult = await launchGameWithXXMI(
      game.executable,
      game.runner.path,
      game.runner.prefix
    )

    if (!loaderResult.success) {
      return { success: false, error: loaderResult.error }
    }

    // Track with null process (XXMI manages the game)
    runningProcesses.set(gameId, { process: null as any, startTime })

    // Note: Playtime tracking is limited with XXMI mode
    // The user launches the game from XXMI Launcher, not from our app
    return { success: true }
  }

  // Normal launch flow (non-XXMI)
  const { command, args, env } = buildLaunchCommand(game, false)

  console.log(`[launch] Launching ${game.name}: ${command} ${args.join(' ')}`)
  console.log(`[launch] Env:`, env)

  // Spawn the process
  const proc = spawn(command, args, {
    env: { ...process.env, ...env },
    detached: true,
    stdio: 'ignore',
  })

  const startTime = Date.now()

  // Track the process
  runningProcesses.set(gameId, { process: proc, startTime })

  // Handle exit
  proc.on('close', (code) => {
    console.log(`[launch] ${game.name} exited with code ${code}`)

    // Calculate playtime in hours
    const sessionPlaytime = (Date.now() - startTime) / 1000 / 60 / 60

    // Update database
    updateGame(gameId, {
      playtime: game.playtime + sessionPlaytime,
      last_played: new Date().toISOString(),
    })

    // Update YAML config with new playtime
    game.playtime = game.playtime + sessionPlaytime
    game.lastPlayed = new Date().toISOString()
    saveGameConfig(game)

    // Run post-launch commands
    for (const cmd of game.launch.postLaunch || []) {
      console.log(`[launch] Running post-launch: ${cmd}`)
      execSync(cmd, { stdio: 'inherit' })
    }

    // Remove from tracking
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
