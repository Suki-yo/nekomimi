import { execSync } from 'child_process'

export interface ProcessInfo {
  pid: number
  ppid: number
  etimes: number
  command: string
  args: string
}

export interface GameProcessTarget {
  exeName: string
  executablePath: string
  launcherPid?: number
  gamePid?: number
  startTime?: number
}

export interface ProcessMonitorEntry<TMetadata> extends GameProcessTarget {
  metadata: TMetadata
  startTime: number
  lastCheck: number
}

export interface ProcessMonitorProbe<TMetadata> {
  id: string
  exeName: string
  executablePath: string
  metadata: TMetadata
}

const WRAPPER_PROCESS_COMMANDS = new Set([
  'bash',
  'gamescope',
  'gamescope-grab',
  'python',
  'python3',
  'pv-adverb',
  'rundll32.exe',
  'srt-bwrap',
  'steam.exe',
  'umu-run',
  'wine',
  'wine64',
  'wineserver',
])

function isWrapperProcess(proc: ProcessInfo): boolean {
  const command = proc.command.toLowerCase().replace(/\\/g, '/').split('/').pop() || ''
  if (WRAPPER_PROCESS_COMMANDS.has(command)) {
    return true
  }

  const args = proc.args.toLowerCase().replace(/\\/g, '/')
  return (
    args.includes('/pressure-vessel/') ||
    args.includes(' waitforexitandrun ') ||
    args.includes('/proton waitforexitandrun ') ||
    args.includes('/steam.exe ') ||
    args.includes(' setupapi,installhinfsection ') ||
    args.includes('/wine.inf')
  )
}

export function matchesGameCommand(command: string, exeName: string): boolean {
  const normalizedCommand = command.toLowerCase().replace(/\\/g, '/').split('/').pop() || ''
  const normalizedExeName = exeName.toLowerCase().replace(/\\/g, '/')
  const exeStem = normalizedExeName.replace(/\.[^.]+$/, '')

  if (normalizedCommand === normalizedExeName || normalizedCommand === exeStem) {
    return true
  }

  return exeStem.length > 15 && normalizedCommand === exeStem.slice(0, 15)
}

export function matchesGameArgs(args: string, target: Pick<GameProcessTarget, 'exeName' | 'executablePath'>): boolean {
  const normalizedArgs = args.toLowerCase().replace(/\\/g, '/')
  const normalizedExecutablePath = target.executablePath.toLowerCase().replace(/\\/g, '/')
  const normalizedExeName = target.exeName.toLowerCase().replace(/\\/g, '/')

  return (
    normalizedArgs.includes(normalizedExecutablePath) ||
    normalizedArgs.includes(`/${normalizedExeName}`) ||
    normalizedArgs.includes(`\\${normalizedExeName}`) ||
    normalizedArgs.includes(` ${normalizedExeName}`) ||
    normalizedArgs.endsWith(normalizedExeName)
  )
}

function matchesGameProcess(proc: ProcessInfo, target: Pick<GameProcessTarget, 'exeName' | 'executablePath'>): boolean {
  if (isWrapperProcess(proc)) {
    return false
  }

  return (
    matchesGameCommand(proc.command, target.exeName) ||
    matchesGameArgs(proc.args, target)
  )
}

export function listProcesses(): ProcessInfo[] {
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

export function pickBestGameProcess(
  candidates: ProcessInfo[],
  target: Pick<GameProcessTarget, 'exeName' | 'executablePath' | 'startTime'>
): ProcessInfo | undefined {
  if (candidates.length === 0) return undefined

  const sessionAgeSeconds = target.startTime
    ? Math.max(1, Math.ceil((Date.now() - target.startTime) / 1000))
    : null
  const recentCandidates = sessionAgeSeconds === null
    ? []
    : candidates.filter((proc) => proc.etimes <= sessionAgeSeconds + 15)
  const pool = recentCandidates.length > 0 ? recentCandidates : candidates

  return pool.sort((a, b) => {
    const normalizedExecutablePath = target.executablePath.toLowerCase().replace(/\\/g, '/')
    const normalizedExeName = target.exeName.toLowerCase().replace(/\\/g, '/')
    const aScore = Number(a.command.toLowerCase() === normalizedExeName) * 2 + Number(a.args.toLowerCase().includes(normalizedExecutablePath))
    const bScore = Number(b.command.toLowerCase() === normalizedExeName) * 2 + Number(b.args.toLowerCase().includes(normalizedExecutablePath))
    if (aScore !== bScore) return bScore - aScore
    return a.etimes - b.etimes
  })[0]
}

export function findGameProcess(target: GameProcessTarget, processes = listProcesses()): ProcessInfo | undefined {
  if (target.gamePid && processes.some((proc) => proc.pid === target.gamePid)) {
    return processes.find((proc) => proc.pid === target.gamePid)
  }

  const descendantPids = target.launcherPid ? getDescendantPids(target.launcherPid, processes) : null
  const descendantCandidates = descendantPids
    ? processes.filter((proc) => descendantPids.has(proc.pid) && matchesGameProcess(proc, target))
    : []
  const descendantMatch = pickBestGameProcess(descendantCandidates, target)
  if (descendantMatch) {
    return descendantMatch
  }

  return pickBestGameProcess(
    processes.filter((proc) => matchesGameProcess(proc, target)),
    target
  )
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

export class ProcessMonitor<TMetadata> {
  private readonly runningProcesses = new Map<string, ProcessMonitorEntry<TMetadata>>()
  private pollInterval: NodeJS.Timeout | null = null

  constructor(
    private readonly onExit: (id: string, entry: ProcessMonitorEntry<TMetadata>) => void,
    private readonly pollIntervalMs = 5000
  ) {}

  get(id: string): ProcessMonitorEntry<TMetadata> | undefined {
    return this.runningProcesses.get(id)
  }

  has(id: string): boolean {
    return this.runningProcesses.has(id)
  }

  set(id: string, entry: ProcessMonitorEntry<TMetadata>): void {
    this.startPolling()
    this.cleanupStaleEntries()
    this.runningProcesses.set(id, entry)
  }

  delete(id: string): void {
    this.runningProcesses.delete(id)
  }

  isProcessRunning(target: Pick<GameProcessTarget, 'exeName' | 'executablePath'>): boolean {
    return !!findGameProcess(target)
  }

  cleanupStaleEntries(): void {
    const now = Date.now()
    const processes = listProcesses()

    for (const [id, running] of Array.from(this.runningProcesses.entries())) {
      const launcherRunning = running.launcherPid ? isPidRunning(running.launcherPid) : false
      const gameProcess = findGameProcess(running, processes)

      if (!gameProcess && !launcherRunning) {
        this.runningProcesses.delete(id)
        this.onExit(id, running)
        continue
      }

      this.runningProcesses.set(id, {
        ...running,
        gamePid: gameProcess?.pid,
        lastCheck: now,
      })
    }
  }

  sync(probes: ProcessMonitorProbe<TMetadata>[]): void {
    this.startPolling()
    this.cleanupStaleEntries()

    const now = Date.now()
    const processes = listProcesses()

    for (const probe of probes) {
      if (this.runningProcesses.has(probe.id) || !probe.exeName) {
        continue
      }

      const gameProcess = findGameProcess(
        {
          exeName: probe.exeName,
          executablePath: probe.executablePath,
          startTime: now,
        },
        processes
      )
      if (!gameProcess) {
        continue
      }

      this.runningProcesses.set(probe.id, {
        exeName: probe.exeName,
        executablePath: probe.executablePath,
        gamePid: gameProcess.pid,
        metadata: probe.metadata,
        startTime: now - gameProcess.etimes * 1000,
        lastCheck: now,
      })
    }
  }

  getSessions(): { id: string; startTime: number }[] {
    this.cleanupStaleEntries()
    return Array.from(this.runningProcesses.entries()).map(([id, data]) => ({
      id,
      startTime: data.startTime,
    }))
  }

  private startPolling(): void {
    if (this.pollInterval) return
    this.pollInterval = setInterval(() => this.cleanupStaleEntries(), this.pollIntervalMs)
  }
}
