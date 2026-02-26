import { spawn, execSync } from 'child_process'
import { getGame, updateGame } from './database'
import { loadGameConfig, saveGameConfig } from './config'
import type { Game } from '../../shared/types/game'

// Track running game processes
const runningProcesses = new Map<string, { process: ReturnType<typeof spawn>, startTime: number }>()

// Build the launch command and environment
function buildLaunchCommand(game: Game): { command: string; args: string[]; env: Record<string, string> } {
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

  // Append custom launch args
  if (game.launch.args) {
    args = args.concat(game.launch.args.split(' ').filter(Boolean))
  }

  return { command, args, env }
}

export async function launchGame(gameId: string): Promise<{ success: boolean; pid?: number; error?: string }> {
  // Check if already running
  if (runningProcesses.has(gameId)) {
    return { success: false, error: 'Game is already running' }
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

  // Run pre-launch commands
  for (const cmd of game.launch.preLaunch || []) {
    console.log(`[launch] Running pre-launch: ${cmd}`)
    try {
      execSync(cmd, { stdio: 'inherit' })
    } catch (err) {
      return { success: false, error: `Pre-launch command failed: ${cmd}` }
    }
  }

  // Build launch command
  const { command, args, env } = buildLaunchCommand(game)

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
