import * as fs from 'fs'
import * as path from 'path'
import { findSteamrt } from './steamrt'
import type { Game } from '../../shared/types/game'
import type { PreflightCheck, PreflightReport, PreflightSeverity } from '../../shared/types/preflight'

interface Probe {
  name: string
  binary: string
  severity: PreflightSeverity
  purpose: string
  installHint: string
}

interface PreflightGateResultOk {
  ok: true
}

interface PreflightGateResultMissing {
  ok: false
  missing: string[]
}

export type PreflightGateResult = PreflightGateResultOk | PreflightGateResultMissing

const PROBES: Probe[] = [
  {
    name: '7z',
    binary: '7z',
    severity: 'required',
    purpose: 'Extract HoYo and Endfield split archives',
    installHint: 'sudo pacman -S p7zip',
  },
  {
    name: 'chmod',
    binary: 'chmod',
    severity: 'required',
    purpose: 'Mark Steam Runtime launchers executable',
    installHint: 'Usually preinstalled via coreutils',
  },
  {
    name: 'pkill',
    binary: 'pkill',
    severity: 'required',
    purpose: 'Clean up stale helper processes during mod launches',
    installHint: 'sudo pacman -S procps-ng',
  },
  {
    name: 'tar',
    binary: 'tar',
    severity: 'required',
    purpose: 'Extract the Steam Runtime archive',
    installHint: 'sudo pacman -S tar',
  },
  {
    name: 'umu-run',
    binary: 'umu-run',
    severity: 'recommended',
    purpose: 'Launch certain Proton-based mod workflows',
    installHint: 'Install umu-launcher from your package manager or AUR',
  },
  {
    name: 'unzip',
    binary: 'unzip',
    severity: 'required',
    purpose: 'Extract XXMI and zip-based mod payloads',
    installHint: 'sudo pacman -S unzip',
  },
  {
    name: 'wine',
    binary: 'wine',
    severity: 'recommended',
    purpose: 'Launch wine-runner games and some fallback tools',
    installHint: 'sudo pacman -S wine',
  },
  {
    name: 'xz',
    binary: 'xz',
    severity: 'required',
    purpose: 'Support Steam Runtime extraction',
    installHint: 'sudo pacman -S xz',
  },
  {
    name: 'zenity',
    binary: 'zenity',
    severity: 'recommended',
    purpose: 'Show Proton first-run dialogs',
    installHint: 'sudo pacman -S zenity',
  },
  {
    name: 'zstd',
    binary: 'zstd',
    severity: 'required',
    purpose: 'Decompress Sophon manifests and chunks',
    installHint: 'sudo pacman -S zstd',
  },
]

let cachedReport: PreflightReport | null = null

function isExecutable(candidatePath: string): boolean {
  try {
    fs.accessSync(candidatePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function whichBinary(binary: string): { ok: boolean; foundAt?: string; error?: string } {
  if (path.isAbsolute(binary)) {
    return isExecutable(binary)
      ? { ok: true, foundAt: binary }
      : { ok: false, error: `${binary} is not executable` }
  }

  const pathValue = process.env.PATH || ''
  for (const part of pathValue.split(path.delimiter)) {
    if (!part) {
      continue
    }

    const candidate = path.join(part, binary)
    if (isExecutable(candidate)) {
      return { ok: true, foundAt: candidate }
    }
  }

  return { ok: false, error: `${binary} not found in PATH` }
}

function buildReport(checks: PreflightCheck[]): PreflightReport {
  return {
    ok: checks
      .filter((check) => check.severity === 'required')
      .every((check) => check.ok),
    checks,
    checkedAt: new Date().toISOString(),
  }
}

function getMissingFromReport(report: PreflightReport, names: string[]): string[] {
  const requiredNames = new Set(names)
  return report.checks
    .filter((check) => requiredNames.has(check.name) && !check.ok)
    .map((check) => check.name)
}

export async function checkPreflight(): Promise<PreflightReport> {
  const checks = PROBES.map((probe) => ({
    name: probe.name,
    binary: probe.binary,
    severity: probe.severity,
    purpose: probe.purpose,
    installHint: probe.installHint,
    ...whichBinary(probe.binary),
  }))

  return buildReport(checks)
}

export async function getPreflightReport(forceRefresh = false): Promise<PreflightReport> {
  if (!cachedReport || forceRefresh) {
    cachedReport = await checkPreflight()
  }

  return cachedReport
}

export function invalidatePreflight(): void {
  cachedReport = null
}

export async function debugPreflight(): Promise<PreflightReport> {
  const report = await checkPreflight()
  console.log('[preflight]', JSON.stringify(report, null, 2))
  return report
}

export async function assertPreflightForBinaryNames(names: string[]): Promise<PreflightGateResult> {
  if (names.length === 0) {
    return { ok: true }
  }

  const report = await getPreflightReport(false)
  const missing = getMissingFromReport(report, names)
  return missing.length === 0 ? { ok: true } : { ok: false, missing }
}

export async function assertPreflightForDownload(names: string[]): Promise<PreflightGateResult> {
  return assertPreflightForBinaryNames(names)
}

export async function assertPreflightForLaunch(game: Pick<Game, 'runner'>): Promise<PreflightGateResult> {
  const required = new Set<string>()

  if (game.runner.type === 'wine') {
    required.add('wine')
  }

  if (game.runner.type === 'proton' && !findSteamrt()) {
    required.add('tar')
    required.add('xz')
    required.add('chmod')
  }

  return assertPreflightForBinaryNames(Array.from(required))
}
