import * as fs from 'fs'
import * as path from 'path'
import { getPathsInstance } from './paths'

const WWMI_PROCESS_EXE_NAMES = ['Client-Win64-Shipping.exe'] as const
const WWMI_DLL_INIT_DELAY_MS = 500

export const WWMI_DIRECT_LAUNCH_ARGS = ['-dx11']
export const WWMI_KURO_DLL_OVERRIDES = 'lsteamclient=d;KRSDKExternal.exe=d'

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
