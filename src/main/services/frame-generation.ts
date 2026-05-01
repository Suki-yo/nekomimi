import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { Game } from '../../shared/types/game'

const LEGACY_WUWA_GAMESCOPE_ENABLED_ENV = 'NEKOMIMI_WUWA_GAMESCOPE'
const FRAMEGEN_MODE_ENV = 'NEKOMIMI_FRAMEGEN'
const ENABLE_LSFG_ENV = 'ENABLE_LSFG'
const LSFG_MULTIPLIER_ENV = 'LSFG_MULTIPLIER'
const LSFG_PERFORMANCE_MODE_ENV = 'LSFG_PERFORMANCE_MODE'
const VK_ADD_IMPLICIT_LAYER_PATH_ENV = 'VK_ADD_IMPLICIT_LAYER_PATH'
const PRESSURE_VESSEL_IMPORT_VULKAN_LAYERS_ENV = 'PRESSURE_VESSEL_IMPORT_VULKAN_LAYERS'
const DEFAULT_LSFG_MULTIPLIER = '3'
const DEFAULT_LSFG_PERFORMANCE_MODE = '1'

function hasAnyFile(candidates: string[]): boolean {
  return candidates.some((candidate) => existsSync(candidate))
}

function getLsfgLayerDirCandidates(): string[] {
  const home = homedir()
  return [
    join(home, '.local', 'share', 'vulkan', 'implicit_layer.d'),
    '/usr/local/share/vulkan/implicit_layer.d',
    '/usr/share/vulkan/implicit_layer.d',
  ]
}

function detectLsfgLayerDir(): string | null {
  return getLsfgLayerDirCandidates().find((candidate) =>
    hasAnyFile([
      join(candidate, 'VkLayer_lsfg_vk.json'),
      join(candidate, 'lsfg-vk.json'),
      join(candidate, 'VkLayer_LS_frame_generation.json'),
    ]),
  ) ?? null
}

function getPreferredLsfgLibraryPath(): string {
  return join(homedir(), '.local', 'lib', 'liblsfg-vk.so')
}

function getPreferredLsfgManifestPath(): string {
  return join(homedir(), '.local', 'share', 'vulkan', 'implicit_layer.d', 'VkLayer_LS_frame_generation.json')
}

function getLosslessDllCandidates(game: Pick<Game, 'launch'>): string[] {
  const home = homedir()
  const configuredDllPath = game.launch.env?.LSFG_DLL_PATH || process.env.LSFG_DLL_PATH

  return [
    configuredDllPath || '',
    join(home, '.local', 'share', 'lossless-scaling', 'Lossless.dll'),
    join(home, '.steam', 'steam', 'steamapps', 'common', 'Lossless Scaling', 'Lossless.dll'),
    join(home, '.local', 'share', 'Steam', 'steamapps', 'common', 'Lossless Scaling', 'Lossless.dll'),
    join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam', 'steamapps', 'common', 'Lossless Scaling', 'Lossless.dll'),
  ]
}

function detectLosslessDllPath(game: Pick<Game, 'launch'>): string | null {
  return getLosslessDllCandidates(game).find((candidate) => !!candidate && existsSync(candidate)) ?? null
}

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export type FrameGenerationMode = 'off' | 'lsfg-vk'

export function getFrameGenerationMode(game: Pick<Game, 'slug' | 'launch'>): FrameGenerationMode {
  if (game.slug !== 'wuwa') {
    return 'off'
  }

  const configuredMode = game.launch.env?.[FRAMEGEN_MODE_ENV]?.trim().toLowerCase()
  if (configuredMode === 'off') {
    return 'off'
  }
  if (configuredMode === 'lsfg-vk') {
    return 'lsfg-vk'
  }

  const legacyEnabled = game.launch.env?.[LEGACY_WUWA_GAMESCOPE_ENABLED_ENV] ?? process.env[LEGACY_WUWA_GAMESCOPE_ENABLED_ENV]
  if (isTruthy(legacyEnabled)) {
    return 'lsfg-vk'
  }

  // Default WuWa to the lsfg-vk route unless explicitly disabled.
  return 'lsfg-vk'
}

export function injectLsfgEnvironment(
  game: Pick<Game, 'slug' | 'launch'>,
  env: Record<string, string>
): Record<string, string> {
  if (getFrameGenerationMode(game) !== 'lsfg-vk') {
    return env
  }

  const detectedDllPath = detectLosslessDllPath(game)
  const detectedLayerDir = detectLsfgLayerDir()

  return {
    ...env,
    [ENABLE_LSFG_ENV]: env[ENABLE_LSFG_ENV] || '1',
    [LSFG_MULTIPLIER_ENV]: env[LSFG_MULTIPLIER_ENV] || DEFAULT_LSFG_MULTIPLIER,
    [LSFG_PERFORMANCE_MODE_ENV]: env[LSFG_PERFORMANCE_MODE_ENV] || DEFAULT_LSFG_PERFORMANCE_MODE,
    ...(detectedDllPath ? { LSFG_DLL_PATH: env.LSFG_DLL_PATH || detectedDllPath } : {}),
    ...(detectedLayerDir
      ? {
          [VK_ADD_IMPLICIT_LAYER_PATH_ENV]: env[VK_ADD_IMPLICIT_LAYER_PATH_ENV] || detectedLayerDir,
          [PRESSURE_VESSEL_IMPORT_VULKAN_LAYERS_ENV]: env[PRESSURE_VESSEL_IMPORT_VULKAN_LAYERS_ENV] || '1',
        }
      : {}),
  }
}

export function ensureLsfgHostInstall(): void {
  const libraryPath = getPreferredLsfgLibraryPath()
  if (!existsSync(libraryPath)) {
    return
  }

  const manifestPath = getPreferredLsfgManifestPath()
  mkdirSync(join(homedir(), '.local', 'share', 'vulkan', 'implicit_layer.d'), { recursive: true })
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        file_format_version: '1.0.0',
        layer: {
          name: 'VK_LAYER_LS_frame_generation',
          type: 'GLOBAL',
          api_version: '1.4.313',
          library_path: libraryPath,
          implementation_version: '1',
          description: 'Lossless Scaling frame generation layer',
          functions: {
            vkGetInstanceProcAddr: 'layer_vkGetInstanceProcAddr',
            vkGetDeviceProcAddr: 'layer_vkGetDeviceProcAddr',
          },
          disable_environment: {
            DISABLE_LSFG: '1',
          },
        },
      },
      null,
      2,
    ),
    'utf-8',
  )
}

export function ensureLsfgConfig(game: Pick<Game, 'slug' | 'launch' | 'executable'>): void {
  if (getFrameGenerationMode(game) !== 'lsfg-vk') {
    return
  }

  ensureLsfgHostInstall()

  const configPath = join(homedir(), '.config', 'lsfg-vk', 'conf.toml')
  if (existsSync(configPath)) {
    return
  }

  const dllPath = detectLosslessDllPath(game)
  if (!dllPath) {
    return
  }

  mkdirSync(join(homedir(), '.config', 'lsfg-vk'), { recursive: true })
  writeFileSync(
    configPath,
    [
      'version = 1',
      '',
      '[global]',
      `dll = "${dllPath.replace(/\\/g, '\\\\')}"`,
      '',
      '[[game]]',
      `exe = "${game.executable.split(/[/\\\\]/).pop() || game.executable}"`,
      `multiplier = ${DEFAULT_LSFG_MULTIPLIER}`,
      `performance_mode = ${DEFAULT_LSFG_PERFORMANCE_MODE === '1' ? 'true' : 'false'}`,
      'experimental_present_mode = "fifo"',
      '',
    ].join('\n'),
    'utf-8',
  )
}

export function validateLsfgRuntime(game: Pick<Game, 'slug' | 'launch'>): string | null {
  if (getFrameGenerationMode(game) !== 'lsfg-vk') {
    return null
  }

  if (!detectLsfgLayerDir()) {
    return 'lsfg-vk is not installed. Install the Vulkan layer first so WuWa can launch with frame generation.'
  }

  const hasLosslessDll = hasAnyFile(getLosslessDllCandidates(game))

  if (!hasLosslessDll) {
    return 'Lossless.dll was not found. Install Lossless Scaling in Steam or set LSFG_DLL_PATH before launching WuWa.'
  }

  return null
}
