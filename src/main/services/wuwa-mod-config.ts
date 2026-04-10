import * as fs from 'fs'
import * as path from 'path'
import { getPathsInstance } from './paths'
import type { Game, WuwaWwmiLaunchMode } from '../../shared/types/game'

const WWMI_PROCESS_EXE_NAMES = ['Client-Win64-Shipping.exe'] as const
const WWMI_DLL_INIT_DELAY_MS = 500
const WUWA_REQUIRED_STEAM_COMPAT_FLAGS = ['noopwr', 'noxalia'] as const
// Prefer the standalone direct-Proton path by default. It removes the extra
// WWMI launcher hop and matches the last known-good no-disconnect flow.
export const DEFAULT_WUWA_WWMI_LAUNCH_MODE: WuwaWwmiLaunchMode = 'direct'

export const WWMI_DIRECT_LAUNCH_ARGS = ['-dx11']
// Keep the direct-Proton WuWa path aligned with the last known-good standalone
// launch chain: disable the external Kuro helper and force native jsproxy.
export const WWMI_KURO_DLL_OVERRIDES = 'lsteamclient=d;KRSDKExternal.exe=d;jsproxy=n,b'
const WUWA_HOSTS_BLOCK_START = '# nekomimi-wuwa-ipv4-start'
const WUWA_HOSTS_BLOCK_END = '# nekomimi-wuwa-ipv4-end'
const WUWA_IPV4_HOST_OVERRIDES = [
  // These IPv4 addresses were observed as the successful WuWa login/gateway
  // endpoints on 2026-04-07 and again on 2026-04-10. The client also tried
  // prod-ali-0.aki-game.net during the same sessions, so pin both gateway
  // hostnames onto the same known-good IPv4 pool to avoid broken DNS/IPv6
  // resolution paths in the Wine prefix.
  ['prod-eo-us-0.aki-game.net', ['43.169.22.2', '43.169.23.2']],
  ['prod-ali-0.aki-game.net', ['43.169.22.2', '43.169.23.2']],
] as const

export function resolveWuwaWwmiLaunchMode(game: Pick<Game, 'slug' | 'mods'>): WuwaWwmiLaunchMode {
  if (game.slug !== 'wuwa') {
    return DEFAULT_WUWA_WWMI_LAUNCH_MODE
  }

  return game.mods.wwmiLaunchMode === 'direct' ? 'direct' : DEFAULT_WUWA_WWMI_LAUNCH_MODE
}

export function applyWwmiLaunchSettings(importerConfig: Record<string, unknown>): void {
  importerConfig.custom_launch_enabled = false
  importerConfig.custom_launch = ''
  importerConfig.custom_launch_signature = ''
  importerConfig.use_launch_options = true
  importerConfig.launch_options = ''
  importerConfig.process_exe_names = [...WWMI_PROCESS_EXE_NAMES]
  importerConfig.configure_game = false
  importerConfig.xxmi_dll_init_delay = WWMI_DLL_INIT_DELAY_MS
}

export function ensureWwmiLinuxCompatibility(importerConfig: Record<string, unknown>): boolean {
  let changed = false

  if (importerConfig.custom_launch_enabled !== false) {
    importerConfig.custom_launch_enabled = false
    changed = true
  }
  if (importerConfig.custom_launch !== '') {
    importerConfig.custom_launch = ''
    changed = true
  }
  if (importerConfig.custom_launch_signature !== '') {
    importerConfig.custom_launch_signature = ''
    changed = true
  }
  if (importerConfig.use_launch_options !== true) {
    importerConfig.use_launch_options = true
    changed = true
  }
  if (importerConfig.launch_options !== '') {
    importerConfig.launch_options = ''
    changed = true
  }

  const processExeNames = JSON.stringify(importerConfig.process_exe_names || [])
  const expectedProcessExeNames = JSON.stringify([...WWMI_PROCESS_EXE_NAMES])
  if (processExeNames !== expectedProcessExeNames) {
    importerConfig.process_exe_names = [...WWMI_PROCESS_EXE_NAMES]
    changed = true
  }

  if (importerConfig.xxmi_dll_init_delay !== WWMI_DLL_INIT_DELAY_MS) {
    importerConfig.xxmi_dll_init_delay = WWMI_DLL_INIT_DELAY_MS
    changed = true
  }

  return changed
}

function ensureSymlinkPath(targetPath: string, linkPath: string): void {
  try {
    if (fs.existsSync(linkPath)) {
      const stat = fs.lstatSync(linkPath)
      if (stat.isSymbolicLink()) {
        const currentTarget = fs.readlinkSync(linkPath)
        if (path.resolve(path.dirname(linkPath), currentTarget) === targetPath || currentTarget === targetPath) {
          return
        }

        fs.unlinkSync(linkPath)
      } else {
        console.warn(`[wwmi] Leaving existing non-symlink path in place: ${linkPath}`)
        return
      }
    }

    fs.symlinkSync(targetPath, linkPath)
    console.log(`[wwmi] Linked runtime asset: ${path.basename(linkPath)}`)
  } catch (err) {
    console.warn(`[wwmi] Failed to link runtime asset ${linkPath}:`, err)
  }
}

function resolveWinePrefix(prefixPath: string): string {
  if (/\/pfx\/?$/.test(prefixPath)) {
    return prefixPath
  }

  const embeddedPrefix = path.join(prefixPath, 'pfx')
  if (fs.existsSync(embeddedPrefix)) {
    return embeddedPrefix
  }

  return prefixPath
}

function stripManagedHostsBlock(content: string): string {
  const blockPattern = new RegExp(
    `\\n?${WUWA_HOSTS_BLOCK_START}[\\s\\S]*?${WUWA_HOSTS_BLOCK_END}\\n?`,
    'g'
  )

  return content.replace(blockPattern, '').trimEnd()
}

export function ensureWuwaPrefixNetworkOverrides(prefixPath: string): boolean {
  const winePrefix = resolveWinePrefix(prefixPath)
  const hostsPath = path.join(winePrefix, 'drive_c', 'windows', 'system32', 'drivers', 'etc', 'hosts')
  const hostsDir = path.dirname(hostsPath)
  fs.mkdirSync(hostsDir, { recursive: true })

  const existingContent = fs.existsSync(hostsPath) ? fs.readFileSync(hostsPath, 'utf-8') : ''
  const baseContent = stripManagedHostsBlock(existingContent)
  const overrideLines = WUWA_IPV4_HOST_OVERRIDES.flatMap(([host, addresses]) =>
    addresses.map((address) => `${address} ${host}`)
  )
  const managedBlock = [
    WUWA_HOSTS_BLOCK_START,
    '# Force WuWa gateway resolution onto known-good IPv4 addresses.',
    ...overrideLines,
    WUWA_HOSTS_BLOCK_END,
  ].join('\n')
  const nextContent = baseContent ? `${baseContent}\n\n${managedBlock}\n` : `${managedBlock}\n`

  if (nextContent === existingContent) {
    return false
  }

  fs.writeFileSync(hostsPath, nextContent, 'utf-8')
  console.log(`[wuwa] Updated prefix hosts override: ${hostsPath}`)
  return true
}

export function prepareStandaloneWwmiRuntime(gameExecutable: string): void {
  const paths = getPathsInstance()
  const gameDir = path.dirname(gameExecutable)
  const wwmiDir = path.join(paths.xxmi, 'WWMI')

  const fileLinks: Array<[string, string]> = [
    [path.join(paths.xxmi, 'd3d11.dll'), path.join(gameDir, 'd3d11.dll')],
    [path.join(paths.xxmi, 'd3dcompiler_47.dll'), path.join(gameDir, 'd3dcompiler_47.dll')],
    [path.join(wwmiDir, 'd3dx.ini'), path.join(gameDir, 'd3dx.ini')],
    [path.join(wwmiDir, 'd3dx_user.ini'), path.join(gameDir, 'd3dx_user.ini')],
  ]

  const dirLinks: Array<[string, string]> = [
    [path.join(wwmiDir, 'Core'), path.join(gameDir, 'Core')],
    [path.join(wwmiDir, 'Mods'), path.join(gameDir, 'Mods')],
    [path.join(wwmiDir, 'ShaderFixes'), path.join(gameDir, 'ShaderFixes')],
    [path.join(wwmiDir, 'ShaderCache'), path.join(gameDir, 'ShaderCache')],
  ]

  for (const [target, link] of fileLinks) {
    if (fs.existsSync(target)) {
      ensureSymlinkPath(target, link)
    }
  }

  for (const [target, link] of dirLinks) {
    if (fs.existsSync(target)) {
      ensureSymlinkPath(target, link)
    }
  }
}

export function cleanupStandaloneWwmiRuntime(gameExecutable: string): void {
  const gameDir = path.dirname(gameExecutable)
  const runtimePaths = [
    'd3d11.dll',
    'd3dcompiler_47.dll',
    'd3dx.ini',
    'd3dx_user.ini',
    'Core',
    'Mods',
    'ShaderFixes',
    'ShaderCache',
  ].map((entry) => path.join(gameDir, entry))

  for (const runtimePath of runtimePaths) {
    try {
      if (!fs.existsSync(runtimePath)) continue

      const stat = fs.lstatSync(runtimePath)
      if (!stat.isSymbolicLink()) continue

      fs.unlinkSync(runtimePath)
      console.log(`[wwmi] Removed staged runtime asset: ${path.basename(runtimePath)}`)
    } catch (err) {
      console.warn(`[wwmi] Failed to remove staged runtime asset ${runtimePath}:`, err)
    }
  }
}

export function mergeWindowsOverrides(...values: Array<string | undefined>): string | undefined {
  const parts = values
    .flatMap((value) => (value || '').split(';'))
    .map((value) => value.trim())
    .filter(Boolean)

  if (parts.length === 0) return undefined

  return Array.from(new Set(parts)).join(';')
}

function mergeCompatFlags(value: string | undefined): string {
  const existingFlags = (value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  return [...WUWA_REQUIRED_STEAM_COMPAT_FLAGS, ...existingFlags.filter((flag) => !WUWA_REQUIRED_STEAM_COMPAT_FLAGS.includes(flag as typeof WUWA_REQUIRED_STEAM_COMPAT_FLAGS[number]))].join(',')
}

export function normalizeWuwaLaunchEnv(
  env: Record<string, string> | undefined,
  launchMode: WuwaWwmiLaunchMode = DEFAULT_WUWA_WWMI_LAUNCH_MODE
): { env: Record<string, string>; changed: boolean } {
  const nextEnv = { ...(env || {}) }

  nextEnv.STEAM_COMPAT_CONFIG = mergeCompatFlags(nextEnv.STEAM_COMPAT_CONFIG)

  const currentOverrides = (nextEnv.WINEDLLOVERRIDES || '')
    .split(';')
    .map((value) => value.trim())
    .filter(Boolean)

  const filteredOverrides =
    launchMode === 'direct'
      ? currentOverrides
      : currentOverrides.filter(
          (value) =>
            value !== 'lsteamclient=d' &&
            value !== 'KRSDKExternal.exe=d' &&
            value !== 'jsproxy=n,b'
        )

  const mergedOverrides =
    launchMode === 'direct'
      ? mergeWindowsOverrides(WWMI_KURO_DLL_OVERRIDES, filteredOverrides.join(';'))
      : mergeWindowsOverrides(filteredOverrides.join(';'))

  if (mergedOverrides) {
    nextEnv.WINEDLLOVERRIDES = mergedOverrides
  } else {
    delete nextEnv.WINEDLLOVERRIDES
  }

  nextEnv.PROTONFIXES_DISABLE = '1'

  const changed =
    nextEnv.STEAM_COMPAT_CONFIG !== (env?.STEAM_COMPAT_CONFIG || '') ||
    nextEnv.WINEDLLOVERRIDES !== (env?.WINEDLLOVERRIDES || '') ||
    nextEnv.PROTONFIXES_DISABLE !== (env?.PROTONFIXES_DISABLE || '')

  return { env: nextEnv, changed }
}

export function normalizeWuwaGameConfig(game: Game): { game: Game; changed: boolean } {
  if (game.slug !== 'wuwa') {
    return { game, changed: false }
  }

  const normalizedLaunchMode = resolveWuwaWwmiLaunchMode(game)
  const normalizedEnv = normalizeWuwaLaunchEnv(game.launch.env, normalizedLaunchMode)
  const launchModeChanged = normalizedLaunchMode !== game.mods.wwmiLaunchMode

  if (!normalizedEnv.changed && !launchModeChanged) {
    return { game, changed: false }
  }

  return {
    changed: true,
    game: {
      ...game,
      launch: {
        ...game.launch,
        env: normalizedEnv.env,
      },
      mods: {
        ...game.mods,
        wwmiLaunchMode: normalizedLaunchMode,
      },
    },
  }
}
