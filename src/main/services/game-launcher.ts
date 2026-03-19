import { spawn, execSync } from 'child_process'
import { mkdirSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { getGame, updateGame } from './database'
import { loadGameConfig, saveGameConfig } from './config'
import { shouldUseXXMI, launchGameWithXXMI, cleanupStandaloneWwmiRuntime } from './mod-manager'
import { findSteamrt, downloadSteamrt } from './steamrt'
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

function isTwintailManagedPath(value: string | undefined): boolean {
  return !!value && value.includes('/twintaillauncher/')
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

interface RunningGame {
  exeName: string
  executablePath: string
  gameName: string
  configPath: string
  initialPlaytime: number
  postLaunch: string[]
  launcherPid?: number
  gamePid?: number
  startTime: number
  lastCheck: number
  cleanupWwmiRuntime?: boolean
}

const STEAM_APP_IDS: Record<string, string> = {
  wuwa: '3513350',
}

const runningProcesses = new Map<string, RunningGame>()
const POLL_INTERVAL = 5000

interface ProcessInfo {
  pid: number
  ppid: number
  etimes: number
  command: string
  args: string
}

function isProcessRunning(exeName: string): boolean {
  if (!exeName) return false
  try {
    const result = execSync(`pgrep -fi "${exeName}"`, { stdio: 'pipe' })
    return result.toString().trim().length > 0
  } catch {
    return false
  }
}

function findPidByPattern(pattern: string): number | undefined {
  if (!pattern) return undefined

  try {
    const output = execSync(`pgrep -fi "${pattern}"`, { stdio: 'pipe' }).toString().trim()
    if (!output) return undefined

    const pids = output
      .split('\n')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0)

    return pids.at(-1)
  } catch {
    return undefined
  }
}

function isPidRunning(pid?: number): boolean {
  if (!pid) return false

  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function listProcesses(): ProcessInfo[] {
  try {
    const output = execSync('ps -eo pid=,ppid=,etimes=,comm=,args=', { stdio: 'pipe' }).toString()
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/)
        if (!match) return null
        return {
          pid: Number(match[1]),
          ppid: Number(match[2]),
          etimes: Number(match[3]),
          command: match[4],
          args: match[5],
        }
      })
      .filter((proc): proc is ProcessInfo => proc !== null)
  } catch {
    return []
  }
}

function getDescendantPids(rootPid: number, processes: ProcessInfo[]): Set<number> {
  const descendants = new Set<number>()
  const queue = [rootPid]

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const proc of processes) {
      if (proc.ppid !== current || descendants.has(proc.pid)) continue
      descendants.add(proc.pid)
      queue.push(proc.pid)
    }
  }

  return descendants
}

function matchesGameProcess(proc: ProcessInfo, running: RunningGame): boolean {
  const args = proc.args.toLowerCase()
  const command = proc.command.toLowerCase()
  const exeName = running.exeName.toLowerCase()
  const executablePath = running.executablePath.toLowerCase()

  return (
    command === exeName ||
    command.endsWith(`/${exeName}`) ||
    args.includes(executablePath) ||
    args.includes(exeName)
  )
}

function pickBestGameProcess(candidates: ProcessInfo[], running: RunningGame): ProcessInfo | undefined {
  if (candidates.length === 0) return undefined

  const sessionAgeSeconds = Math.max(1, Math.ceil((Date.now() - running.startTime) / 1000))
  const recentCandidates = candidates.filter((proc) => proc.etimes <= sessionAgeSeconds + 15)
  const pool = recentCandidates.length > 0 ? recentCandidates : candidates

  return pool.sort((a, b) => {
    const aScore = Number(a.command.toLowerCase() === running.exeName.toLowerCase()) * 2 + Number(a.args.toLowerCase().includes(running.executablePath.toLowerCase()))
    const bScore = Number(b.command.toLowerCase() === running.exeName.toLowerCase()) * 2 + Number(b.args.toLowerCase().includes(running.executablePath.toLowerCase()))
    if (aScore !== bScore) return bScore - aScore
    return a.etimes - b.etimes
  })[0]
}

function resolveGamePid(running: RunningGame, processes: ProcessInfo[]): number | undefined {
  if (running.gamePid && processes.some((proc) => proc.pid === running.gamePid)) {
    return running.gamePid
  }

  const descendantPids = running.launcherPid ? getDescendantPids(running.launcherPid, processes) : null
  const descendantCandidates = descendantPids
    ? processes.filter((proc) => descendantPids.has(proc.pid) && matchesGameProcess(proc, running))
    : []
  const descendantMatch = pickBestGameProcess(descendantCandidates, running)
  if (descendantMatch) {
    return descendantMatch.pid
  }

  const globalMatch = pickBestGameProcess(
    processes.filter((proc) => matchesGameProcess(proc, running)),
    running
  )
  if (globalMatch) {
    return globalMatch.pid
  }

  const exeStem = running.exeName.replace(/\.[^.]+$/, '')
  return findPidByPattern(running.exeName) ?? findPidByPattern(exeStem)
}

function finalizeRunningGame(gameId: string, running: RunningGame) {
  const completedAt = new Date().toISOString()
  const sessionPlaytime = (Date.now() - running.startTime) / 1000 / 60 / 60
  const totalPlaytime = running.initialPlaytime + sessionPlaytime

  console.log(`[launch] Finalizing session for ${running.gameName}`)

  updateGame(gameId, {
    playtime: totalPlaytime,
    last_played: completedAt,
  })

  const loadedGame = loadGameConfig(running.configPath)
  if (loadedGame) {
    loadedGame.playtime = totalPlaytime
    loadedGame.lastPlayed = completedAt
    saveGameConfig(loadedGame)
  }

  if (running.cleanupWwmiRuntime) {
    cleanupStandaloneWwmiRuntime(running.executablePath)
  }

  for (const cmd of running.postLaunch) {
    console.log(`[launch] Running post-launch: ${cmd}`)
    try {
      execSync(cmd, { stdio: 'inherit' })
    } catch {
      // Ignore post-launch errors
    }
  }

  runningProcesses.delete(gameId)
}

function cleanupStaleEntries() {
  const now = Date.now()
  const processes = listProcesses()

  for (const [gameId, running] of runningProcesses.entries()) {
    const launcherRunning = running.launcherPid ? isPidRunning(running.launcherPid) : false
    const gamePid = resolveGamePid(running, processes)
    const gameRunning = !!gamePid

    if (!gameRunning && !launcherRunning) {
      finalizeRunningGame(gameId, running)
    } else {
      running.gamePid = gamePid
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

function resolveRunnerPrefix(game: Game): string {
  const configuredPrefix = expandHome(game.runner.prefix)
  if (configuredPrefix) {
    return configuredPrefix
  }

  const generatedPrefix = join(homedir(), '.local', 'share', 'nekomimi', 'prefixes', game.slug, 'pfx')
  mkdirSync(generatedPrefix, { recursive: true })
  return generatedPrefix
}

function getUmuGameId(game: Game): string {
  const configuredGameId = game.launch.env?.GAMEID
  if (configuredGameId) {
    return configuredGameId
  }

  if (game.slug === 'wuwa') {
    return 'umu-3513350'
  }

  return '0'
}

function buildLaunchCommand(game: Game, useXXMI: boolean): { command: string; args: string[]; env: Record<string, string> } {
  // Resolve prefix: expand ~ and auto-generate if empty
  const prefix = resolveRunnerPrefix(game)

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
    env.SteamOS = '1'

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
      env.GAMEID = getUmuGameId(game)
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
  const game = loadedGame

  const standaloneConfigError = validateStandaloneWuwaConfig(game)
  if (standaloneConfigError) {
    return { success: false, error: standaloneConfigError }
  }

  const exeName = game.executable.split(/[/\\]/).pop() || game.executable

  if (isProcessRunning(exeName)) {
    console.log(`[launch] ${exeName} is already running`)
    return { success: false, error: 'Game is already running' }
  }

  const existing = runningProcesses.get(gameId)
  if (existing) {
    console.log(`[launch] Cleaning up stale entry for ${exeName}`)
    finalizeRunningGame(gameId, existing)
  }

  if (!game.executable || !game.runner?.path) {
    return { success: false, error: 'Game is missing required launch fields (executable or runner)' }
  }

  ensureSteamCompatMarkers(game)

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
      executablePath: game.executable,
      gameName: game.name,
      configPath: gameRow.config_path,
      initialPlaytime: game.playtime,
      postLaunch: game.launch.postLaunch || [],
      launcherPid: loaderResult.pid,
      startTime,
      lastCheck: Date.now(),
      cleanupWwmiRuntime: game.mods?.importer === 'WWMI',
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

  runningProcesses.set(gameId, {
    exeName,
    executablePath: game.executable,
    gameName: game.name,
    configPath: gameRow.config_path,
    initialPlaytime: game.playtime,
    postLaunch: game.launch.postLaunch || [],
    launcherPid: proc.pid,
    startTime,
    lastCheck: Date.now(),
  })

  proc.on('close', (code) => {
    console.log(`[launch] Launcher for ${game.name} exited with code ${code}`)
    cleanupStaleEntries()
  })

  proc.on('error', (err) => {
    console.error(`[launch] Process error:`, err)
    cleanupStaleEntries()
  })

  return { success: true, pid: proc.pid }
}

export function syncRunningGames(
  games: Array<{ id: string; configPath: string; game: Game }>
): void {
  startPolling()
  cleanupStaleEntries()

  const now = Date.now()
  const processes = listProcesses()

  for (const { id, configPath, game } of games) {
    if (runningProcesses.has(id) || !game.executable) {
      continue
    }

    const exeName = game.executable.split(/[/\\]/).pop() || game.executable
    const probe: RunningGame = {
      exeName,
      executablePath: game.executable,
      gameName: game.name,
      configPath,
      initialPlaytime: game.playtime,
      postLaunch: game.launch.postLaunch || [],
      startTime: now,
      lastCheck: now,
    }

    const gamePid = resolveGamePid(probe, processes)
    if (!gamePid) {
      continue
    }

    const processInfo = processes.find((proc) => proc.pid === gamePid)
    const startTime = processInfo ? now - processInfo.etimes * 1000 : now

    runningProcesses.set(id, {
      ...probe,
      gamePid,
      startTime,
      lastCheck: now,
    })
  }
}

export function getRunningGames(): { id: string; startTime: number }[] {
  cleanupStaleEntries()
  return Array.from(runningProcesses.entries()).map(([id, data]) => ({
    id,
    startTime: data.startTime,
  }))
}
