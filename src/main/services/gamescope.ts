import type { Game } from '../../shared/types/game'

const WUWA_GAMESCOPE_ENABLED_ENV = 'NEKOMIMI_WUWA_GAMESCOPE'
const WUWA_GAMESCOPE_ARGS_ENV = 'NEKOMIMI_WUWA_GAMESCOPE_ARGS'
const DEFAULT_WUWA_GAMESCOPE_ARGS = '-f -S fit -F fsr --sharpness 8 -w 1920 -h 1080 -W 2560 -H 1440'

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
      if (current) {
        args.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }

  if (current) {
    args.push(current)
  }

  return args
}

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export function wrapLaunchWithGamescope(
  game: Pick<Game, 'slug' | 'launch'>,
  command: string,
  args: string[]
): { command: string; args: string[] } {
  if (game.slug !== 'wuwa' || command === 'gamescope') {
    return { command, args }
  }

  const enabled = game.launch.env?.[WUWA_GAMESCOPE_ENABLED_ENV] ?? process.env[WUWA_GAMESCOPE_ENABLED_ENV]
  if (!isTruthy(enabled)) {
    return { command, args }
  }

  const configuredArgs = game.launch.env?.[WUWA_GAMESCOPE_ARGS_ENV] ?? process.env[WUWA_GAMESCOPE_ARGS_ENV] ?? DEFAULT_WUWA_GAMESCOPE_ARGS

  return {
    command: 'gamescope',
    args: [...shellSplit(configuredArgs), '--', command, ...args],
  }
}
