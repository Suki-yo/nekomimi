import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface LaunchCommandSpec {
  command: string
  args: string[]
}

interface NiriOutputInfo {
  name?: string
  modes?: Array<{ refresh_rate?: number }>
  current_mode?: number
  logical?: {
    width?: number
    height?: number
  }
}

function resolveExternalGamescopeGrabPath(): string | null {
  const override = process.env.NEKOMIMI_GAMESCOPE_GRAB
  const candidates = override
    ? [override]
    : [join(homedir(), '.local', 'bin', 'gamescope-grab')]

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

function clampRefreshHz(refreshRateMillihz?: number): number | null {
  if (!refreshRateMillihz || refreshRateMillihz <= 0) {
    return null
  }

  const refreshHz = Math.max(1, Math.round(refreshRateMillihz / 1000))
  const maxRefresh = Number.parseInt(process.env.NEKOMIMI_GAMESCOPE_MAX_REFRESH || '', 10)
  if (Number.isFinite(maxRefresh) && maxRefresh > 0) {
    return Math.min(refreshHz, maxRefresh)
  }

  return Math.min(refreshHz, 144)
}

function resolveFocusedOutput(): NiriOutputInfo | null {
  try {
    const raw = execFileSync('niri', ['msg', '-j', 'focused-output'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return JSON.parse(raw) as NiriOutputInfo
  } catch {
    return null
  }
}

export function wrapWithGamescopeGrab(spec: LaunchCommandSpec): LaunchCommandSpec {
  if (process.env.NEKOMIMI_GAMESCOPE_DISABLE === '1') {
    return spec
  }

  const externalWrapperPath = resolveExternalGamescopeGrabPath()
  if (process.env.NEKOMIMI_GAMESCOPE_GRAB && externalWrapperPath) {
    return {
      command: externalWrapperPath,
      args: [spec.command, ...spec.args],
    }
  }

  const focusedOutput = resolveFocusedOutput()
  const width = focusedOutput?.logical?.width
  const height = focusedOutput?.logical?.height
  if (!width || !height) {
    if (!externalWrapperPath) {
      return spec
    }

    return {
      command: externalWrapperPath,
      args: [spec.command, ...spec.args],
    }
  }

  const backend = process.env.NEKOMIMI_GAMESCOPE_BACKEND || 'wayland'
  const refreshRateMillihz = focusedOutput?.modes?.[focusedOutput.current_mode || 0]?.refresh_rate
  const refreshHz = clampRefreshHz(refreshRateMillihz)
  const args = backend === 'wayland'
    ? [
        '-b',
        '-w', String(width),
        '-h', String(height),
        '-W', String(width),
        '-H', String(height),
        '--force-grab-cursor',
        '--backend', backend,
      ]
    : [
        '-f',
        '-w', String(width),
        '-h', String(height),
        '-W', String(width),
        '-H', String(height),
        '--force-grab-cursor',
        '--backend', backend,
      ]

  if (refreshHz && backend !== 'wayland') {
    args.push('-r', String(refreshHz))
  }

  args.push('--', spec.command, ...spec.args)

  return {
    command: 'gamescope',
    args,
  }
}
