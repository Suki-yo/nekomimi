import { spawn, execSync } from 'child_process'
import { getGame, updateGame } from './database'
import { loadGameConfig, saveGameConfig } from './config'
import { shouldUseXXMI, launchGameWithXXMI, getXXMIImporter } from './mod-manager'
import type { Game } from '../../shared/types/game'

// Track running game processes - now tracks actual game process info
interface RunningGame {
  exeName: string         // Game executable name (e.g., "Endfield.exe")
  launcherPid?: number    // Launcher/wine process PID (for cleanup)
  startTime: number
  lastCheck: number       // Last time we verified it was running
}

const runningProcesses = new Map<string, RunningGame>()

// Polling interval for checking running games (ms)
const POLL_INTERVAL = 5000

// Check if a process is running by name using pgrep
function isProcessRunning(exeName: string): boolean {
  try {
    // pgrep returns 0 if found, 1 if not found
    const result = execSync(`pgrep -f "${exeName}"`, { stdio: 'pipe' })
    return result.toString().trim().length > 0
  } catch {
    return false
  }
}

// Get all PIDs for a process name
function getProcessPids(exeName: string): number[] {
  try {
    const result = execSync(`pgrep -f "${exeName}"`, { stdio: 'pipe' })
    return result.toString().trim().split('\n')
      .filter(Boolean)
      .map(line => parseInt(line, 10))
  } catch {
    return []
  }
}

// Clean up stale entries (processes that are no longer running)
function cleanupStaleEntries() {
  let cleaned = 0
  const now = Date.now()

  for (const [gameId, running] of runningProcesses.entries()) {
    // Check if process is actually running
    const isRunning = isProcessRunning(running.exeName)

    if (!isRunning) {
      // Process not found - remove stale entry
      console.log(`[launch] Cleaning up stale entry for ${running.exeName}`)
      runningProcesses.delete(gameId)
      cleaned++
    } else {
      // Update last check time
      running.lastCheck = now
    }
  }

  if (cleaned > 0) {
    console.log(`[launch] Cleaned up ${cleaned} stale game tracking entries`)
  }
}

// Start the polling loop for cleanup
let pollInterval: NodeJS.Timeout | null = null
function startPolling() {
  if (pollInterval) return
  pollInterval = setInterval(cleanupStaleEntries, POLL_INTERVAL)
  console.log('[launch] Started process polling (every 5s)')
}

// Ensure polling is started when this module is imported
startPolling()

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
  // Start polling if not already running
  startPolling()

  // Clean up any stale entries before checking
  cleanupStaleEntries()

  // Fetch game from database
  const gameRow = getGame(gameId)
  if (!gameRow) {
    return { success: false, error: 'Game not found' }
  }

  // Load full game config from YAML
  const game = loadGameConfig(gameRow.config_path)
  if (!game) {
    return { success: false, error: 'Game config not found' }
  }

  // Get game executable name for tracking
  const exeName = game.executable.split(/[/\\]/).pop() || game.executable

  // Check if already running by searching for the actual game process
  const existing = runningProcesses.get(gameId)
  const isCurrentlyRunning = isProcessRunning(exeName)

  if (isCurrentlyRunning) {
    // Game is actually running
    console.log(`[launch] ${exeName} is already running`)
    return { success: false, error: 'Game is already running' }
  }

  // If we have a stale entry (exists in our map but not actually running), clean it up
  if (existing) {
    console.log(`[launch] Cleaning up stale entry for ${exeName}`)
    runningProcesses.delete(gameId)
  }

  // Validate required fields
  if (!game.executable || !game.runner?.path || !game.runner?.prefix) {
    return { success: false, error: 'Game is missing required launch fields' }
  }

  // Check if XXMI should be used for this game
  // Only use XXMI if: 1) game supports XXMI, AND 2) mods are enabled for this game
  const gameSupportsXXMI = shouldUseXXMI(game.executable)
  const modsEnabled = game.mods?.enabled ?? false
  const useXXMI = gameSupportsXXMI && modsEnabled

  // Log why XXMI is or isn't being used
  if (gameSupportsXXMI && !modsEnabled) {
    console.log(`[launch] Game supports mods but mods are disabled - launching vanilla`)
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

  const startTime = Date.now()

  // XXMI mode: Launch via XXMI Launcher with --nogui flag
  // XXMI auto-launches the game with mod injection
  if (useXXMI) {
    console.log(`[launch] Using XXMI mode - game will launch with mods (gameSupportsXXMI=${gameSupportsXXMI}, modsEnabled=${modsEnabled})`)

    // Launch XXMI Launcher
    const loaderResult = await launchGameWithXXMI(
      game.executable,
      game.directory,
      game.runner.path,
      game.runner.prefix
    )

    if (!loaderResult.success) {
      return { success: false, error: loaderResult.error }
    }

    // Track the game by executable name (XXMI mode)
    runningProcesses.set(gameId, {
      exeName,
      startTime,
      lastCheck: Date.now(),
    })

    // Note: Playtime tracking is limited with XXMI mode
    // The actual game PID is managed by XXMI, not us
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

  // Track the game by executable name and launcher PID
  runningProcesses.set(gameId, {
    exeName,
    launcherPid: proc.pid,
    startTime,
    lastCheck: Date.now(),
  })

  // Handle exit
  proc.on('close', (code) => {
    console.log(`[launch] Launcher for ${game.name} exited with code ${code}`)

    // Note: For Proton/Wine, the launcher exiting doesn't mean the game exited
    // We'll rely on polling to detect when the actual game process is gone

    // Calculate playtime in hours (rough estimate since we track launcher, not game)
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

    // Remove from tracking (polling will verify game is actually gone)
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
