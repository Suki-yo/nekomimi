import * as fs from 'fs'
import * as path from 'path'
import { getPathsInstance } from './paths'
import type { Game, WuwaWwmiLaunchMode } from '../../shared/types/game'

const WWMI_PROCESS_EXE_NAMES = ['Client-Win64-Shipping.exe'] as const
const WWMI_DLL_INIT_DELAY_MS = 500
const WUWA_REQUIRED_STEAM_COMPAT_FLAGS = ['noopwr', 'noxalia'] as const
// Prefer the hidden standalone direct-Proton path by default. It avoids showing
// the XXMI launcher while still passing WuWa's Engine.ini LOD override file.
export const DEFAULT_WUWA_WWMI_LAUNCH_MODE: WuwaWwmiLaunchMode = 'direct'

export const WWMI_ENGINE_INI_OVERRIDE = 'Kuro_Please_Add_Force_LOD0_For_Characters_To_Settings_Engine.ini'
export const WUWA_ENGINE_INI_NAME = 'Nekomimi_Engine.ini'
export const WWMI_DIRECT_LAUNCH_ARGS = ['-dx11', `-ENGINEINI=${WUWA_ENGINE_INI_NAME}`]
export const WUWA_ENGINE_INI_LAUNCH_ARG = `-EngineIni=${WUWA_ENGINE_INI_NAME}`
// Disable lsteamclient to avoid Steam client dependency. Disable KRSDKExternal.exe
// (Kuro telemetry SDK) which burns ~1 full CPU core at runtime with no gameplay impact.
// jsproxy is left at Wine defaults — blocking it may interfere with proxy-dependent HTTP.
export const WWMI_KURO_DLL_OVERRIDES = 'lsteamclient=d;KRSDKExternal.exe=d'
const WUWA_HOSTS_BLOCK_START = '# nekomimi-wuwa-ipv4-start'
const WUWA_HOSTS_BLOCK_END = '# nekomimi-wuwa-ipv4-end'
const WUWA_ENGINE_CONFIG_SOURCE_START = '; nekomimi-wuwa-engine-config-start'
const WUWA_ENGINE_CONFIG_SOURCE_END = '; nekomimi-wuwa-engine-config-end'
const ALTERIAX_WUWA_CONFIG_1 = `; Lower FPS compared to default due to view distance increase

; If motion blur is turning back on even with in-game settings off add the command below
; r.MotionBlur.Max=0

[SystemSettings]
r.ParallelFrustumCull=1
r.ParallelOcclusionCull=1
r.StaticMeshLODDistanceScale=0.5
r.ScreenSizeCullRatioFactor=1
r.Kuro.KuroEnableFFTBloom=1
r.Kuro.KuroEnableToonFFTBloom=1
r.Kuro.KuroBloomStreak=1
r.EnableLensflareSceneSample=1
r.DepthOfFieldQuality=2
r.SceneColorFringeQuality=0
; Remove r.Tonemapper.Quality=1 if you use bloom and find some scenes bright
r.Tonemapper.Quality=1
r.AODownsampleFactor=1
r.AmbientOcclusion.Intensity=-1
r.AmbientOcclusionMaxQuality=100
r.Shadow.RadiusThreshold=0.01
r.Shadow.PerObjectResolutionMax=2048
r.Shadow.PerObjectResolutionMin=2048
r.DetailMode=2
r.MaterialQualityLevel=1
r.KuroMaterialQualityLevel=1
r.ViewDistanceScale=3.0
foliage.LODDistanceScale=3.0
foliage.DensityScaleLOD.DrawCallOptimize=1
r.SSR.MaxRoughness=1.0
r.SSR.HalfResSceneColor=0
r.KuroVolumetricLight.ColorMaskDownSampleFactor=1
r.KuroVolumetricLight.DownSampleFactor=1
r.LightShaftDownSampleFactor=1
r.Upscale.Quality=3
a.URO.ForceAnimRate=1
r.VRS.EnableMaterial=false
r.VRS.EnableMesh=false
; If textures still load late or blurry, increase r.Streaming.MinBoost and r.Streaming.PoolSize values but uses more VRAM
r.Streaming.MinBoost=3.0
r.Streaming.PoolSize=2560
r.streaming.MeshMaxKeepMips=15
r.streaming.TextureMaxKeepMips=15
r.Streaming.UsingKuroStreamingPriority=0
r.Kuro.Foliage.GrassCullDistanceMax=17500
r.Kuro.Foliage.Grass3_0CullDistanceMax=20000
wp.Runtime.SoraGridBlackListHeight=20000
wp.Runtime.PlannedLoadingRangeScale=1.0
r.Streamline.DLSSG.RetainResourcesWhenOff=1

; RT is enabled, set r.RayTracing.LoadConfig to 0 if you don't use it before launching game
[/Script/Engine.RendererSettings]
r.RayTracing.LoadConfig=1
`
const ALTERIAX_WUWA_CONFIG_2 = `; Lower FPS compared to default due to view distance increase

; If motion blur is turning back on even with in-game settings off add the command below
; r.MotionBlur.Max=0

; Add the command below to fix stuttering with menus when using DLSS Frame Gen (Increases VRAM usage)
; r.Streamline.DLSSG.RetainResourcesWhenOff=1

[SystemSettings]
r.ParallelFrustumCull=1
r.ParallelOcclusionCull=1
r.StaticMeshLODDistanceScale=0.5
r.ScreenSizeCullRatioFactor=3
r.Kuro.KuroEnableFFTBloom=1
r.Kuro.KuroEnableToonFFTBloom=1
r.Kuro.KuroBloomStreak=1
r.EnableLensflareSceneSample=1
r.DepthOfFieldQuality=2
r.SceneColorFringeQuality=0
; Remove r.Tonemapper.Quality=1 if you use bloom and find some scenes bright
r.Tonemapper.Quality=1
r.AODownsampleFactor=2
r.AmbientOcclusion.Intensity=-1
r.AmbientOcclusionMaxQuality=100
r.Shadow.RadiusThreshold=0.01
r.Shadow.PerObjectResolutionMax=1024
r.Shadow.PerObjectResolutionMin=1024
r.DetailMode=2
r.MaterialQualityLevel=1
r.KuroMaterialQualityLevel=1
r.ViewDistanceScale=2.0
foliage.LODDistanceScale=2.0
foliage.DensityScaleLOD.DrawCallOptimize=1
r.SSR.MaxRoughness=1.0
r.SSR.HalfResSceneColor=0
r.KuroVolumetricLight.ColorMaskDownSampleFactor=1
r.KuroVolumetricLight.DownSampleFactor=1
r.LightShaftDownSampleFactor=1
r.Upscale.Quality=3
a.URO.ForceAnimRate=1
r.VRS.EnableMaterial=false
r.VRS.EnableMesh=false
; If textures still load late or blurry, increase r.Streaming.MinBoost and r.Streaming.PoolSize values but uses more VRAM
r.Streaming.MinBoost=2.0
; Can increase r.Streaming.PoolSize to 2560 if using GPU with 16GB VRAM
r.Streaming.PoolSize=1536
r.streaming.MeshMaxKeepMips=15
r.streaming.TextureMaxKeepMips=15
r.Streaming.UsingKuroStreamingPriority=0
r.Kuro.Foliage.GrassCullDistanceMax=17500
r.Kuro.Foliage.Grass3_0CullDistanceMax=20000
wp.Runtime.SoraGridBlackListHeight=15000
wp.Runtime.PlannedLoadingRangeScale=1.0

; RT is disabled, set r.RayTracing.LoadConfig to 1 if you use it before launching game
[/Script/Engine.RendererSettings]
r.RayTracing.LoadConfig=0
`
const ALTERIAX_WUWA_CONFIG_3 = `; Slightly lower FPS compared to default due to view distance increase

; If motion blur is turning back on even with in-game settings off add the command below
; r.MotionBlur.Max=0

[SystemSettings]
r.ParallelFrustumCull=1
r.ParallelOcclusionCull=1
r.StaticMeshLODDistanceScale=0.7
r.ScreenSizeCullRatioFactor=3
r.Kuro.KuroEnableFFTBloom=1
r.Kuro.KuroEnableToonFFTBloom=1
r.Kuro.KuroBloomStreak=1
r.EnableLensflareSceneSample=1
r.DepthOfFieldQuality=2
r.SceneColorFringeQuality=0
; Remove r.Tonemapper.Quality=1 if you use bloom and find some scenes bright
r.Tonemapper.Quality=1
r.AODownsampleFactor=2
r.AmbientOcclusion.Intensity=-1
r.AmbientOcclusionMaxQuality=100
r.Shadow.RadiusThreshold=0.02
r.Shadow.PerObjectResolutionMax=1024
r.Shadow.PerObjectResolutionMin=1024
r.DetailMode=2
r.MaterialQualityLevel=1
r.KuroMaterialQualityLevel=1
r.ViewDistanceScale=1.5
foliage.DensityScaleLOD.DrawCallOptimize=1
r.SSR.MaxRoughness=1.0
r.SSR.HalfResSceneColor=0
r.Kuro.KuroTyndallScatteringsDownSampleFactor=1
r.KuroVolumetricLight.ColorMaskDownSampleFactor=1
r.KuroVolumetricLight.DownSampleFactor=1
r.LightShaftDownSampleFactor=1
r.Upscale.Quality=3
a.URO.ForceAnimRate=1
r.VRS.EnableMaterial=false
r.VRS.EnableMesh=false
; If textures still load late or blurry, increase r.Streaming.MinBoost and r.Streaming.PoolSize values but uses more VRAM
r.Streaming.MinBoost=2.0
; Lower r.Streaming.PoolSize to 1024 if using GPU with 6GB VRAM
r.Streaming.PoolSize=1536
r.streaming.MeshMaxKeepMips=15
r.streaming.TextureMaxKeepMips=15
r.Streaming.UsingKuroStreamingPriority=0
r.Kuro.Foliage.GrassCullDistanceMax=15000
r.Kuro.Foliage.Grass3_0CullDistanceMax=17500
wp.Runtime.SoraGridBlackListHeight=10000
wp.Runtime.PlannedLoadingRangeScale=0.9
Kuro.Script.EnableCSharpEnv=true

; RT is disabled, set r.RayTracing.LoadConfig to 1 if you use it before launching game
[/Script/Engine.RendererSettings]
r.MaxAnisotropy=16
r.RayTracing.LoadConfig=0
`
const ALTERIAX_WUWA_CONFIG_4 = `; If motion blur is turning back on even with in-game settings off add the command below
; r.MotionBlur.Max=0

; For GPUs with 6GB VRAM or higher (1080p) - To fix blurry textures for certain stuff you can add the command below
; r.Streaming.MinBoost=2.0
; r.Streaming.PoolSize=1024

[SystemSettings]
r.StaticMeshLODDistanceScale=0.7
r.ScreenSizeCullRatioFactor=3
r.Kuro.KuroEnableFFTBloom=1
r.Kuro.KuroEnableToonFFTBloom=1
r.Kuro.KuroBloomStreak=1
r.EnableLensflareSceneSample=1
r.DepthOfFieldQuality=2
r.SceneColorFringeQuality=0
; Remove r.Tonemapper.Quality=1 if you use bloom and find some scenes bright
r.Tonemapper.Quality=1
r.AODownsampleFactor=2
r.AmbientOcclusion.Intensity=-1
r.AmbientOcclusionMaxQuality=100
r.Shadow.RadiusThreshold=0.03
r.Shadow.MaxCSMResolution=512
r.Shadow.MaxResolution=512
r.Shadow.MinResolution=512
r.Shadow.PerObjectShadowMapResolution=512
r.Shadow.PerObjectResolutionMax=512
r.Shadow.PerObjectResolutionMin=512
r.DetailMode=1
r.MaterialQualityLevel=2
r.KuroMaterialQualityLevel=2
foliage.DensityScaleLOD.DrawCallOptimize=1
r.SSR.MaxRoughness=1.0
r.SSR.HalfResSceneColor=0
r.Kuro.KuroTyndallScatteringsDownSampleFactor=2
r.KuroVolumetricLight.ColorMaskDownSampleFactor=2
r.KuroVolumetricLight.DownSampleFactor=2
r.LightShaftDownSampleFactor=1
r.Upscale.Quality=3
a.URO.ForceAnimRate=1
r.VRS.EnableMaterial=false
r.VRS.EnableMesh=false
r.streaming.MeshMaxKeepMips=15
r.streaming.TextureMaxKeepMips=15
r.Streaming.UsingKuroStreamingPriority=0
wp.Runtime.SoraGridBlackListHeight=7500
wp.Runtime.PlannedLoadingRangeScale=0.6
Kuro.Script.EnableCSharpEnv=true

[/Script/Engine.RendererSettings]
r.MaxAnisotropy=16
r.RayTracing.LoadConfig=0
`
const ALTERIAX_WUWA_CONFIG_5 = `; If motion blur is turning back on even with in-game settings off add the command below
; r.MotionBlur.Max=0

[SystemSettings]
; Reduce r.SecondaryScreenPercentage.GameViewport to 83 or lower if you need more FPS
r.SecondaryScreenPercentage.GameViewport=100
r.Kuro.MaterialDesktopQualityShoulderRender=0
r.StaticMeshLODDistanceScale=0.7
r.ScreenSizeCullRatioFactor=10
r.Kuro.KuroEnableFFTBloom=0
r.Kuro.KuroEnableToonFFTBloom=0
r.Kuro.KuroBloomStreak=1
r.EnableLensflareSceneSample=1
r.DepthOfFieldQuality=2
r.SceneColorFringeQuality=0
; Remove r.Tonemapper.Quality=1 if you use bloom and find some scenes bright
r.Tonemapper.Quality=1
r.AmbientOcclusionMaxQuality=0
r.Shadow.DistanceScale=0.6
r.Shadow.RadiusThreshold=0.06
r.Shadow.MaxCSMResolution=256
r.Shadow.MaxResolution=256
r.Shadow.MinResolution=256
r.Shadow.PerObjectShadowMapResolution=256
r.Shadow.PerObjectResolutionMax=256
r.Shadow.PerObjectResolutionMin=256
r.Shadow.ForbidHISMShadowStartIndex=0
r.DetailMode=0
r.MaterialQualityLevel=2
r.KuroMaterialQualityLevel=2
; If you want grass back remove foliage.CullAll=1
foliage.CullAll=1
foliage.DensityScaleLOD.DrawCallOptimize=1
r.ViewDistanceScale=0.8
r.SSR.Quality=0
r.Upscale.Quality=3
r.Kuro.InteractionEffect.EnableFoliageEffect=0
r.Kuro.InteractionEffect.UseCppWaterEffect=0
r.KuroVolumeCloudEnable=0
a.URO.ForceAnimRate=1
r.SSFS=0
r.VRS.EnableMaterial=false
r.VRS.EnableMesh=false
r.streaming.MeshMaxKeepMips=15
r.streaming.TextureMaxKeepMips=15
wp.Runtime.PlannedLoadingRangeScale=0.4
Kuro.Script.EnableCSharpEnv=true

[/Script/Engine.RendererSettings]
r.MaxAnisotropy=4
r.RayTracing.LoadConfig=0
`
const ALTERIAX_WUWA_CONFIGS: Record<'1' | '2' | '3' | '4' | '5', string> = {
  '1': ALTERIAX_WUWA_CONFIG_1,
  '2': ALTERIAX_WUWA_CONFIG_2,
  '3': ALTERIAX_WUWA_CONFIG_3,
  '4': ALTERIAX_WUWA_CONFIG_4,
  '5': ALTERIAX_WUWA_CONFIG_5,
}
const WUWA_INPUT_INI_OVERRIDES = `[/Script/Engine.InputSettings]
bEnableMouseSmoothing=False
bEnableFOVScaling=False
`
const WWMI_LOD_FIX_CONFIG = `[SystemSettings]
r.Kuro.SkeletalMesh.LODDistanceScaleDeviceOffset=-10
r.Streaming.Boost=20
r.Streaming.MinBoost=0
r.Streaming.UseAllMips=1
r.Streaming.PoolSize=0
r.Streaming.LimitPoolSizeToVRAM=1
r.Streaming.UseFixedPoolSize=1
`
const WUWA_GPU_PERF_CONFIG = `[SystemSettings]
FX.AllowGPUParticles=1
r.HZBOcclusion=1
r.ParallelFrustumCull=1
r.ParallelOcclusionCull=1
Kuro.Blueprint.EnableGameBudget=false
`
const WWMI_LOD_FIX_KEYS = [
  'r.Kuro.SkeletalMesh.LODDistanceScaleDeviceOffset',
  'r.Streaming.Boost',
  'r.Streaming.UseAllMips',
  'r.Streaming.LimitPoolSizeToVRAM',
  'r.Streaming.UseFixedPoolSize',
] as const
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

  if (game.mods.wwmiLaunchMode === 'direct' || game.mods.wwmiLaunchMode === 'launcher') {
    return game.mods.wwmiLaunchMode
  }

  return DEFAULT_WUWA_WWMI_LAUNCH_MODE
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

function resolveAlteriaxWuwaConfig(): { variant: '1' | '2' | '3' | '4' | '5'; content: string } {
  const requestedVariant = process.env.NEKOMIMI_WUWA_ENGINE_CONFIG
  const variant = requestedVariant === '1' || requestedVariant === '2' || requestedVariant === '3' || requestedVariant === '4' || requestedVariant === '5'
    ? requestedVariant
    : '4'

  return {
    variant,
    content: ALTERIAX_WUWA_CONFIGS[variant],
  }
}

function writeFileIfChanged(filePath: string, content: string): boolean {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf-8') === content) {
    return false
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
  return true
}

function stripManagedEngineConfig(content: string): string {
  const blockPattern = new RegExp(
    `${WUWA_ENGINE_CONFIG_SOURCE_START}[\\s\\S]*?${WUWA_ENGINE_CONFIG_SOURCE_END}\\n?`,
    'g'
  )

  return content.replace(blockPattern, '').trim()
}

function readExistingWwmiModfixConfig(binariesDir: string): string {
  const wwmiOverridePath = path.join(binariesDir, WWMI_ENGINE_INI_OVERRIDE)
  if (!fs.existsSync(wwmiOverridePath)) {
    return ''
  }

  const content = stripManagedEngineConfig(fs.readFileSync(wwmiOverridePath, 'utf-8'))
  const hasWwmiLodFixes = WWMI_LOD_FIX_KEYS.some((key) => content.includes(`${key}=`))

  return hasWwmiLodFixes ? content : ''
}

function resolveWuwaClientBinariesDir(game: Pick<Game, 'directory' | 'executable'>): string {
  const executableDir = path.dirname(game.executable)
  if (path.isAbsolute(executableDir)) {
    return executableDir
  }

  return path.join(game.directory, executableDir)
}

function resolveWuwaSavedConfigDir(game: Pick<Game, 'directory'>): string {
  return path.join(game.directory, 'Client', 'Saved', 'Config', 'WindowsNoEditor')
}

function ensureWuwaInputConfig(game: Pick<Game, 'directory'>): boolean {
  const inputPath = path.join(resolveWuwaSavedConfigDir(game), 'Input.ini')
  const existingContent = fs.existsSync(inputPath) ? fs.readFileSync(inputPath, 'utf-8') : ''

  let nextContent = existingContent
  if (nextContent.includes('bEnableMouseSmoothing=') || nextContent.includes('bEnableFOVScaling=')) {
    nextContent = nextContent
      .replace(/^bEnableMouseSmoothing=.*$/m, 'bEnableMouseSmoothing=False')
      .replace(/^bEnableFOVScaling=.*$/m, 'bEnableFOVScaling=False')
  } else if (nextContent.includes('[/Script/Engine.InputSettings]')) {
    nextContent = nextContent.replace(
      '[/Script/Engine.InputSettings]',
      WUWA_INPUT_INI_OVERRIDES.trimEnd()
    )
  } else {
    nextContent = existingContent ? `${WUWA_INPUT_INI_OVERRIDES.trimEnd()}\n\n${existingContent}` : `${WUWA_INPUT_INI_OVERRIDES}`
  }

  if (nextContent === existingContent) {
    return false
  }

  fs.mkdirSync(path.dirname(inputPath), { recursive: true })
  fs.writeFileSync(inputPath, nextContent, 'utf-8')
  console.log(`[wuwa] Updated Input.ini mouse/FOV overrides: ${inputPath}`)
  return true
}

export function ensureWuwaEngineConfig(game: Pick<Game, 'slug' | 'directory' | 'executable'>): boolean {
  if (game.slug !== 'wuwa') {
    return false
  }

  const { variant, content } = resolveAlteriaxWuwaConfig()
  const binariesDir = resolveWuwaClientBinariesDir(game)
  const existingModfixConfig = readExistingWwmiModfixConfig(binariesDir)
  const managedContent = [
    WUWA_ENGINE_CONFIG_SOURCE_START,
    '; Managed by nekomimi for nekomimi launches only.',
    `; AlteriaX/WuWa-Configs variant: Config ${variant}. Set NEKOMIMI_WUWA_ENGINE_CONFIG=1-5 before launch to switch.`,
    '',
    content.trim(),
    '',
    '; WWMI LOD/modfix overrides. Keep this after performance settings so these values win.',
    WWMI_LOD_FIX_CONFIG.trim(),
    existingModfixConfig
      ? [
          '',
          '; Existing WWMI/modfix Engine.ini content follows.',
          existingModfixConfig,
        ].join('\n')
      : '',
    '',
    '; nekomimi GPU performance overrides. Last wins in UE4 — these take priority over any WWMI content above.',
    WUWA_GPU_PERF_CONFIG.trim(),
    WUWA_ENGINE_CONFIG_SOURCE_END,
    '',
  ].filter((part) => part !== '').join('\n')

  const wroteEngineIni = writeFileIfChanged(path.join(binariesDir, WUWA_ENGINE_INI_NAME), managedContent)

  if (wroteEngineIni) {
    console.log(`[wuwa] Updated combined nekomimi Engine.ini Config ${variant}: ${binariesDir}`)
  }

  const wroteInputIni = ensureWuwaInputConfig(game)

  return wroteEngineIni || wroteInputIni
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

  const filteredOverrides = currentOverrides.filter(
    (value) =>
      value !== 'KRSDKExternal.exe=d' &&
      value !== 'jsproxy=n,b' &&
      (launchMode === 'direct' || value !== 'lsteamclient=d')
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
  nextEnv.PROTON_USE_NTSYNC = '1'

  if (!nextEnv.NEKOMIMI_FRAMEGEN) {
    nextEnv.NEKOMIMI_FRAMEGEN = 'lsfg-vk'
  }

  const changed =
    nextEnv.STEAM_COMPAT_CONFIG !== (env?.STEAM_COMPAT_CONFIG || '') ||
    nextEnv.WINEDLLOVERRIDES !== (env?.WINEDLLOVERRIDES || '') ||
    nextEnv.PROTONFIXES_DISABLE !== (env?.PROTONFIXES_DISABLE || '') ||
    nextEnv.PROTON_USE_NTSYNC !== (env?.PROTON_USE_NTSYNC || '') ||
    nextEnv.NEKOMIMI_FRAMEGEN !== (env?.NEKOMIMI_FRAMEGEN || '')

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
