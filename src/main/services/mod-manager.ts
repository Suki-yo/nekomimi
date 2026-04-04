import { spawn, execSync } from 'child_process'
import type { ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as https from 'https'
import { getGameModConfig, getImporterConfig, getImporterReleaseApi } from './game-registry'
import { getPathsInstance } from './paths'
import { findSteamrt } from './steamrt'
import {
  applyWwmiLaunchSettings,
  cleanupStandaloneWwmiRuntime,
  ensureWwmiLinuxCompatibility,
  mergeWindowsOverrides,
  normalizeWuwaLaunchEnv,
  prepareStandaloneWwmiRuntime,
  resolveWuwaWwmiLaunchMode,
  WWMI_DIRECT_LAUNCH_ARGS,
  WWMI_KURO_DLL_OVERRIDES,
} from './wuwa-mod-config'
import { wrapWithGamescopeGrab } from './gamescope'
import type { Game, Mod } from '../../shared/types/game'

const XXMI_RELEASES_API = 'https://api.github.com/repos/SpectrumQT/XXMI-Launcher/releases/latest'
const PROTON_GE_RELEASES_API = 'https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases/latest'
const XXMI_LIBS_RELEASES_API = 'https://api.github.com/repos/SpectrumQT/XXMI-Libs-Package/releases/latest'

const DISABLED_MOD_PREFIX = 'DISABLED_'
const STAR_RAIL_PATCH_CANDIDATES = [
  path.join(process.cwd(), 'resources', 'hkrpg_patch.dll'),
  path.join(process.resourcesPath || '', 'resources', 'hkrpg_patch.dll'),
  path.join(process.resourcesPath || '', 'hkrpg_patch.dll'),
  '/usr/lib/twintaillauncher/resources/hkrpg_patch.dll',
]

export function shouldUseXXMI(executablePath: string): boolean {
  return getGameModConfig(executablePath) !== null
}

export function getXXMIImporter(executablePath: string): string | null {
  return getGameModConfig(executablePath)?.importer ?? null
}

function getXXMIPaths() {
  const paths = getPathsInstance()
  return {
    xxmiDir: paths.xxmi,
    launcherExe: path.join(paths.xxmi, 'Resources', 'Bin', 'XXMI Launcher.exe'),
    launcherPrefix: path.join(paths.xxmi, 'prefix'),
    runnersDir: paths.runners,
  }
}

function ensureStarRailDbghelp(gameDirectory: string): { success: boolean; error?: string } {
  const dbghelpPath = path.join(gameDirectory, 'dbghelp.dll')

  try {
    const stat = fs.statSync(dbghelpPath)
    if (stat.isFile() && stat.size > 0) {
      return { success: true }
    }
  } catch {
    // Missing or unreadable; try to restore it from a known resource path.
  }

  const source = STAR_RAIL_PATCH_CANDIDATES.find((candidate) => {
    try {
      const stat = fs.statSync(candidate)
      return stat.isFile() && stat.size > 0
    } catch {
      return false
    }
  })

  if (!source) {
    return {
      success: false,
      error: 'Star Rail requires dbghelp.dll (hkrpg_patch.dll) in the game directory, but no bundled patch resource was found.',
    }
  }

  try {
    fs.copyFileSync(source, dbghelpPath)
    console.log(`[starrail] Restored dbghelp.dll from ${source}`)
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      error: `Failed to install Star Rail dbghelp.dll: ${message}`,
    }
  }
}

function stripDisabledModPrefix(folderName: string): string {
  if (folderName.startsWith(DISABLED_MOD_PREFIX)) {
    return folderName.substring(DISABLED_MOD_PREFIX.length)
  }

  return folderName
}

function addDisabledModPrefix(folderName: string, disabled: boolean): string {
  if (disabled) {
    return `${DISABLED_MOD_PREFIX}${folderName}`
  }

  return folderName
}

function removeFileIfExists(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
}

function findInstalledRunner(): { name: string; path: string; wine: string } | null {
  const { runnersDir } = getXXMIPaths()
  if (!fs.existsSync(runnersDir)) return null

  const entries = fs.readdirSync(runnersDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.toLowerCase().includes('proton') || entry.name.toLowerCase().includes('ge-')) {
      const winePath = path.join(runnersDir, entry.name, 'files', 'bin', 'wine64')
      if (fs.existsSync(winePath)) {
        return {
          name: entry.name,
          path: path.join(runnersDir, entry.name),
          wine: winePath,
        }
      }
    }
  }
  return null
}

function ensureWindowsDllAliases(importerDir: string): void {
  const aliases: Array<[string, string]> = [
    ['d3d11.dll', 'D3D11.dll'],
    ['d3dcompiler_47.dll', 'D3DCOMPILER_47.dll'],
  ]

  for (const [sourceName, aliasName] of aliases) {
    const sourcePath = path.join(importerDir, sourceName)
    const aliasPath = path.join(importerDir, aliasName)

    if (!fs.existsSync(sourcePath) || fs.existsSync(aliasPath)) continue

    try {
      fs.copyFileSync(sourcePath, aliasPath)
    } catch (err) {
      console.warn(`[xxmi] Failed to create DLL alias ${aliasName}:`, err)
    }
  }
}

function ensureImporterRootSymlinks(importerDir: string): void {
  const { xxmiDir } = getXXMIPaths()
  const aliases: Array<[string, string]> = [
    ['d3d11.dll', 'd3d11.dll'],
    ['d3dcompiler_47.dll', 'd3dcompiler_47.dll'],
  ]

  for (const [rootName, importerName] of aliases) {
    const rootPath = path.join(xxmiDir, rootName)
    const importerPath = path.join(importerDir, importerName)

    if (!fs.existsSync(rootPath)) continue

    try {
      if (fs.existsSync(importerPath)) {
        const stat = fs.lstatSync(importerPath)
        if (stat.isSymbolicLink()) {
          const currentTarget = fs.readlinkSync(importerPath)
          if (path.resolve(importerDir, currentTarget) === rootPath || currentTarget === rootPath) {
            continue
          }

          fs.unlinkSync(importerPath)
          console.log(`[xxmi] Replacing stale DLL symlink: ${importerName} -> ${currentTarget}`)
        } else {
          continue
        }
      }

      fs.symlinkSync(rootPath, importerPath)
      console.log(`[xxmi] Created shared DLL symlink: ${importerName}`)
    } catch (err) {
      console.warn(`[xxmi] Failed to create shared DLL symlink ${importerName}:`, err)
    }
  }
}

export function isXXMIInstalled(): boolean {
  const { launcherExe } = getXXMIPaths()
  return fs.existsSync(launcherExe)
}

export function isRunnerInstalled(): boolean {
  return findInstalledRunner() !== null
}

export function getInstalledRunner(): { name: string; path: string; wine: string } | null {
  return findInstalledRunner()
}

interface GitHubRelease {
  tag_name: string
  assets: Array<{ name: string; browser_download_url: string; size?: number }>
}

async function fetchGitHubRelease(apiUrl: string): Promise<GitHubRelease | null> {
  return new Promise((resolve) => {
    const req = https.get(
      apiUrl,
      {
        headers: {
          'User-Agent': 'Nekomimi-Launcher',
          Accept: 'application/vnd.github.v3+json',
        },
      },
      (response) => {
        let data = ''
        response.on('data', (chunk) => (data += chunk))
        response.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            if (response.statusCode !== 200 || parsed.message) {
              console.error(`[github] API error (HTTP ${response.statusCode}): ${parsed.message || data.slice(0, 200)}`)
              resolve(null)
              return
            }
            resolve(parsed)
          } catch {
            console.error('[github] Failed to parse API response:', data.slice(0, 200))
            resolve(null)
          }
        })
      }
    )
    req.on('error', (err) => {
      console.error('[github] API request failed:', err)
      resolve(null)
    })
    req.end()
  })
}

async function getXXMIPortableDownloadUrl(): Promise<{ url: string; version: string } | null> {
  const release = await fetchGitHubRelease(XXMI_RELEASES_API)
  if (!release) return null

  const portableAsset = release.assets?.find(
    (asset) => asset.name.includes('Portable') && asset.name.endsWith('.zip')
  )
  if (!portableAsset) {
    console.error('[xxmi] No portable asset found in release')
    return null
  }
  return { url: portableAsset.browser_download_url, version: release.tag_name }
}

async function getProtonGEDownloadUrl(): Promise<{ url: string; version: string; size: number } | null> {
  const release = await fetchGitHubRelease(PROTON_GE_RELEASES_API)
  if (!release) return null

  const tarballAsset = release.assets?.find(
    (asset) => asset.name.endsWith('.tar.gz') && !asset.name.includes('.sha')
  )
  if (!tarballAsset) {
    console.error('[runner] No tar.gz asset found in release')
    return null
  }
  return {
    url: tarballAsset.browser_download_url,
    version: release.tag_name,
    size: tarballAsset.size ?? 0,
  }
}

interface DownloadResult {
  success: boolean
  error?: string
}

async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (percent: number) => void
): Promise<DownloadResult> {
  return new Promise((resolve) => {
    const downloadWithRedirect = (currentUrl: string, redirectCount = 0): void => {
      if (redirectCount > 5) {
        resolve({ success: false, error: 'Too many redirects' })
        return
      }

      const file = fs.createWriteStream(destPath)

      https.get(currentUrl, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            file.close()
            removeFileIfExists(destPath)
            downloadWithRedirect(redirectUrl, redirectCount + 1)
            return
          }
        }

        if (response.statusCode !== 200) {
          file.close()
          removeFileIfExists(destPath)
          resolve({ success: false, error: `HTTP ${response.statusCode}` })
          return
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10)
        let downloaded = 0

        response.pipe(file)

        response.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          if (totalSize > 0 && onProgress) {
            onProgress(Math.round((downloaded / totalSize) * 100))
          }
        })

        file.on('finish', () => {
          file.close()
          resolve({ success: true })
        })

        file.on('error', (err) => {
          console.error('[download] File write error:', err)
          file.close()
          removeFileIfExists(destPath)
          resolve({ success: false, error: `Write failed: ${err.message}` })
        })
      }).on('error', (err) => {
        console.error('[download] Download error:', err)
        file.close()
        removeFileIfExists(destPath)
        resolve({ success: false, error: `Download failed: ${err.message}` })
      })
    }

    downloadWithRedirect(url)
  })
}

async function extractArchive(
  archivePath: string,
  destDir: string,
  type: 'zip' | 'tar.gz'
): Promise<DownloadResult> {
  return new Promise((resolve) => {
    const command = type === 'zip'
      ? spawn('unzip', ['-o', archivePath, '-d', destDir], { stdio: 'inherit' })
      : spawn('tar', ['-xzf', archivePath, '-C', destDir], { stdio: 'inherit' })

    command.on('close', (code) => {
      removeFileIfExists(archivePath)
      if (code === 0) {
        resolve({ success: true })
      } else {
        resolve({ success: false, error: `Extraction failed (exit code ${code})` })
      }
    })

    command.on('error', (err) => {
      console.error('[extract] Error:', err)
      removeFileIfExists(archivePath)
      resolve({ success: false, error: `Extraction failed: ${err.message}` })
    })
  })
}

export async function downloadXXMI(onProgress?: (percent: number) => void): Promise<DownloadResult> {
  const { xxmiDir } = getXXMIPaths()

  if (!fs.existsSync(xxmiDir)) {
    fs.mkdirSync(xxmiDir, { recursive: true })
  }

  const releaseInfo = await getXXMIPortableDownloadUrl()
  if (!releaseInfo) {
    return { success: false, error: 'Failed to get release info from GitHub' }
  }

  console.log(`[xxmi] Downloading ${releaseInfo.version}`)
  const zipPath = path.join(xxmiDir, 'xxmi-temp.zip')

  const downloadResult = await downloadFile(releaseInfo.url, zipPath, onProgress)
  if (!downloadResult.success) {
    return downloadResult
  }

  console.log('[xxmi] Extracting...')
  const extractResult = await extractArchive(zipPath, xxmiDir, 'zip')
  if (extractResult.success) {
    console.log('[xxmi] Installation complete')
  }
  return extractResult
}

export async function downloadRunner(onProgress?: (percent: number) => void): Promise<DownloadResult> {
  const { runnersDir } = getXXMIPaths()

  if (!fs.existsSync(runnersDir)) {
    fs.mkdirSync(runnersDir, { recursive: true })
  }

  const releaseInfo = await getProtonGEDownloadUrl()
  if (!releaseInfo) {
    return { success: false, error: 'Failed to get release info from GitHub' }
  }

  console.log(`[runner] Downloading ${releaseInfo.version}`)
  const tarPath = path.join(runnersDir, 'proton-temp.tar.gz')

  const downloadResult = await downloadFile(releaseInfo.url, tarPath, onProgress)
  if (!downloadResult.success) {
    return downloadResult
  }

  console.log('[runner] Extracting...')
  const extractResult = await extractArchive(tarPath, runnersDir, 'tar.gz')
  if (extractResult.success) {
    console.log('[runner] Installation complete')
  }
  return extractResult
}

export async function downloadImporter(
  importer: string,
  onProgress?: (percent: number) => void
): Promise<DownloadResult> {
  const apiUrl = getImporterReleaseApi(importer)
  if (!apiUrl) return { success: false, error: `Unknown importer: ${importer}` }

  const { xxmiDir } = getXXMIPaths()
  if (!fs.existsSync(xxmiDir)) fs.mkdirSync(xxmiDir, { recursive: true })

  // Phase 1: Download importer package (provides d3dx.ini and Core/)
  // The zip has flat structure (d3dx.ini at root, no IMPORTER/ wrapper), so extract to importerDir
  const importerRelease = await fetchGitHubRelease(apiUrl)
  if (!importerRelease) return { success: false, error: 'Failed to fetch importer release' }
  console.log(`[xxmi] ${importer} release assets:`, importerRelease.assets?.map(a => a.name))
  const importerAsset = importerRelease.assets?.find(a => a.name.toLowerCase().endsWith('.zip'))
  if (!importerAsset) return { success: false, error: `No zip asset in importer release (tag: ${importerRelease.tag_name}, assets: ${JSON.stringify(importerRelease.assets?.map(a => a.name))})` }

  console.log(`[xxmi] Downloading ${importer} package ${importerRelease.tag_name}`)
  const importerZip = path.join(xxmiDir, `${importer}-temp.zip`)
  const dl1 = await downloadFile(importerAsset.browser_download_url, importerZip,
    onProgress ? p => onProgress(Math.round(p * 0.7)) : undefined)
  if (!dl1.success) return dl1

  const importerDir = path.join(xxmiDir, importer)
  if (!fs.existsSync(importerDir)) fs.mkdirSync(importerDir, { recursive: true })
  const ex1 = await extractArchive(importerZip, importerDir, 'zip')
  if (!ex1.success) return ex1

  // Phase 2: Deploy shared XXMI Libs DLLs (d3d11.dll + d3dcompiler_47.dll) at root
  // Use symlinks like Twintail does, so DLLs are shared across all importers
  const sharedDll = path.join(xxmiDir, 'd3d11.dll')
  const sharedCompiler = path.join(xxmiDir, 'd3dcompiler_47.dll')

  if (!fs.existsSync(sharedDll) || !fs.existsSync(sharedCompiler)) {
    // Download XXMI-Libs-Package; extract and move DLLs to xxmiDir root
    const libsRelease = await fetchGitHubRelease(XXMI_LIBS_RELEASES_API)
    if (!libsRelease) return { success: false, error: 'Failed to fetch XXMI libs release' }
    const libsAsset = libsRelease.assets?.find(a => a.name.toLowerCase().endsWith('.zip'))
    if (!libsAsset) return { success: false, error: `No zip asset in XXMI libs release (assets: ${JSON.stringify(libsRelease.assets?.map(a => a.name))})` }

    console.log(`[xxmi] Downloading XXMI-Libs ${libsRelease.tag_name}`)
    const libsZip = path.join(xxmiDir, 'xxmi-libs-temp.zip')
    const dl2 = await downloadFile(libsAsset.browser_download_url, libsZip,
      onProgress ? p => onProgress(70 + Math.round(p * 0.3)) : undefined)
    if (!dl2.success) return dl2

    // Extract to temp folder first to find DLLs (zip may have them at root or in subdir)
    const tempDir = path.join(xxmiDir, 'xxmi-libs-temp')
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
    const ex2 = await extractArchive(libsZip, tempDir, 'zip')
    if (!ex2.success) return ex2

    // Find and move d3d11.dll and d3dcompiler_47.dll to root
    const findAndMove = (filename: string, dest: string) => {
      // First check in root of extraction
      let src = path.join(tempDir, filename)
      if (fs.existsSync(src)) {
        fs.renameSync(src, dest)
        console.log(`[xxmi] Moved ${filename} to root`)
        return true
      }
      // Otherwise search subdirs
      const entries = fs.readdirSync(tempDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subpath = path.join(tempDir, entry.name, filename)
          if (fs.existsSync(subpath)) {
            fs.copyFileSync(subpath, dest)
            console.log(`[xxmi] Copied ${filename} to root`)
            return true
          }
        }
      }
      return false
    }

    if (!fs.existsSync(sharedDll)) {
      if (!findAndMove('d3d11.dll', sharedDll)) {
        console.warn('[xxmi] Could not find d3d11.dll in XXMI-Libs package')
      }
    }
    if (!fs.existsSync(sharedCompiler)) {
      if (!findAndMove('d3dcompiler_47.dll', sharedCompiler)) {
        console.warn('[xxmi] Could not find d3dcompiler_47.dll in XXMI-Libs package')
      }
    }

    // Cleanup temp folder
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch (err) {
      console.warn('[xxmi] Failed to clean up temp folder:', err)
    }
  }

  // Phase 2b: Create symlinks from importer folder to shared DLLs (Twintail style)
  const dllLink = path.join(importerDir, 'd3d11.dll')
  const compilerLink = path.join(importerDir, 'd3dcompiler_47.dll')

  try {
    // Remove old files/links if they exist
    if (fs.existsSync(dllLink)) {
      fs.unlinkSync(dllLink)
    }
    if (fs.existsSync(compilerLink)) {
      fs.unlinkSync(compilerLink)
    }

    // Create symlinks to shared DLLs
    fs.symlinkSync(sharedDll, dllLink, 'file')
    console.log(`[xxmi] Created symlink for d3d11.dll`)
    fs.symlinkSync(sharedCompiler, compilerLink, 'file')
    console.log(`[xxmi] Created symlink for d3dcompiler_47.dll`)
  } catch (err) {
    console.error('[xxmi] Failed to create symlinks:', err)
    return { success: false, error: `Failed to create symlinks: ${err}` }
  }

  ensureWindowsDllAliases(importerDir)

  // Phase 3: Register importer in XXMI config
  const configPath = path.join(xxmiDir, 'XXMI Launcher Config.json')
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (config?.Launcher && !config.Launcher.enabled_importers.includes(importer)) {
        config.Launcher.enabled_importers.push(importer)
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4))
        console.log(`[xxmi] Added ${importer} to enabled_importers`)
      }
    } catch (err) {
      console.error('[xxmi] Failed to register importer in config:', err)
    }
  }

  console.log(`[xxmi] ${importer} installed successfully`)
  return { success: true }
}

function linuxToWinePath(linuxPath: string): string {
  return 'Z:' + linuxPath.replace(/\//g, '\\')
}

function resolveProtonCompatPaths(prefixPath: string): { winePrefix: string; compatDataPath: string } {
  if (/\/pfx\/?$/.test(prefixPath)) {
    return {
      winePrefix: prefixPath,
      compatDataPath: prefixPath.replace(/\/pfx\/?$/, ''),
    }
  }

  const embeddedPrefix = path.join(prefixPath, 'pfx')
  if (fs.existsSync(embeddedPrefix)) {
    return {
      winePrefix: embeddedPrefix,
      compatDataPath: prefixPath,
    }
  }

  return {
    winePrefix: prefixPath,
    compatDataPath: prefixPath,
  }
}

export function isImporterInstalled(importer: string): boolean {
  const { xxmiDir } = getXXMIPaths()
  const dllPath = path.join(xxmiDir, importer, 'd3d11.dll')
  const compilerPath = path.join(xxmiDir, importer, 'd3dcompiler_47.dll')

  try {
    const dllStat = fs.statSync(dllPath)
    const compilerStat = fs.statSync(compilerPath)
    return dllStat.isFile() && compilerStat.isFile() && dllStat.size > 0 && compilerStat.size > 0
  } catch {
    return false
  }
}

function configureImporterGameFolder(importer: string, gameDirectory: string, _executablePath?: string): boolean {
  const { xxmiDir } = getXXMIPaths()
  const configPath = path.join(xxmiDir, 'XXMI Launcher Config.json')
  const importerSettings = getImporterConfig(importer)

  if (!fs.existsSync(configPath) || !importerSettings) return false

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const winePath = linuxToWinePath(gameDirectory)
    const wineExePath = _executablePath ? linuxToWinePath(_executablePath) : undefined

    // Always update Launcher section regardless of whether importer is installed yet
    if (config?.Launcher) {
      config.Launcher.active_importer = importer
      if (!config.Launcher.enabled_importers.includes(importer)) {
        config.Launcher.enabled_importers.push(importer)
      }
    }

    if (config?.Importers?.[importer]?.Importer) {
      // Importer already installed — update game folder and mode
      const importerConfig = config.Importers[importer].Importer
      importerConfig.game_folder = winePath
      if (wineExePath) {
        importerConfig.game_exe_path = wineExePath
      }
      importerConfig.process_start_method = 'Shell'
      importerConfig.custom_launch_inject_mode = importerSettings.launchMode
      if (!importerSettings.configureGame) {
        importerConfig.configure_game = false
      }
      if (importer === 'WWMI') {
        applyWwmiLaunchSettings(importerConfig)
      }
    } else {
      // Importer just installed via downloadImporter — seed a minimal config stub so
      // XXMI finds a valid Importers section and doesn't show its own install dialog.
      const importerConfig: Record<string, unknown> = {
        game_folder: winePath,
        process_start_method: 'Shell',
        custom_launch_inject_mode: importerSettings.launchMode,
      }
      if (wineExePath) {
        importerConfig.game_exe_path = wineExePath
      }
      if (!importerSettings.configureGame) {
        importerConfig.configure_game = false
      }

      if (importer === 'WWMI') {
        applyWwmiLaunchSettings(importerConfig)
      }

      if (!config.Importers) config.Importers = {}
      config.Importers[importer] = {
        Importer: importerConfig,
      }
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 4))
    console.log(`[xxmi] Configured ${importer} with game folder: ${winePath}`)
    return true
  } catch (err) {
    console.error('[xxmi] Failed to configure importer:', err)
    return false
  }
}

function ensureLinuxCompatibility(importer: string, _executablePath?: string): void {
  const { xxmiDir } = getXXMIPaths()
  const configPath = path.join(xxmiDir, 'XXMI Launcher Config.json')
  const importerSettings = getImporterConfig(importer)

  if (!fs.existsSync(configPath) || !importerSettings) return

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

    if (config?.Importers?.[importer]?.Importer) {
      const importerConfig = config.Importers[importer].Importer
      let needsSave = false

      if (importerConfig.process_start_method !== 'Shell') {
        importerConfig.process_start_method = 'Shell'
        needsSave = true
      }

      if (importerConfig.custom_launch_inject_mode !== importerSettings.launchMode) {
        importerConfig.custom_launch_inject_mode = importerSettings.launchMode
        needsSave = true
      }

      if (!importerSettings.configureGame && importerConfig.configure_game !== false) {
        importerConfig.configure_game = false
        needsSave = true
      }

      if (importer === 'WWMI') {
        needsSave = ensureWwmiLinuxCompatibility(importerConfig) || needsSave
      }

      if (needsSave) {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4))
        console.log(`[xxmi] Updated ${importer} settings for Linux compatibility`)
      }
    }
  } catch (err) {
    console.error('[xxmi] Failed to ensure Linux compatibility:', err)
  }
}

interface ProtonLaunchSpec {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
  cwd: string
}

interface DetachedSpawnOptions {
  logPath?: string
}

function buildProtonLaunchSpec(
  targetPath: string,
  targetArgs: string[],
  runnerPath: string,
  winePrefix: string,
  gameDirectory: string,
  gameEnv: Record<string, string>,
  steamAppId: string,
  windowsOverrides?: string,
  disableProtonFixes = true,
  cwd = gameDirectory
): ProtonLaunchSpec {
  const { winePrefix: normalizedWinePrefix, compatDataPath } = resolveProtonCompatPaths(winePrefix)
  const steamrt = findSteamrt()

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...gameEnv,
    SteamOS: '1',
    PROTONPATH: runnerPath,
    WINEPREFIX: normalizedWinePrefix,
    STEAM_COMPAT_DATA_PATH: compatDataPath,
    STEAM_COMPAT_APP_ID: steamAppId,
    WINEARCH: 'win64',
  }

  if (disableProtonFixes) {
    env.PROTONFIXES_DISABLE = '1'
  } else {
    delete env.PROTONFIXES_DISABLE
  }

  if (windowsOverrides) {
    env.WINEDLLOVERRIDES = windowsOverrides
  }

  if (steamrt) {
    const shaderCache = path.join(compatDataPath, 'shadercache')
    fs.mkdirSync(shaderCache, { recursive: true })

    return {
      command: path.join(steamrt, '_v2-entry-point'),
      args: [
        '--verb=waitforexitandrun', '--',
        path.join(runnerPath, 'proton'),
        'waitforexitandrun',
        linuxToWinePath(targetPath),
        ...targetArgs,
      ],
      env: {
        ...env,
        STEAM_COMPAT_CLIENT_INSTALL_PATH: '',
        STEAM_COMPAT_INSTALL_PATH: gameDirectory,
        STEAM_COMPAT_LIBRARY_PATHS: `${gameDirectory}:${normalizedWinePrefix}`,
        STEAM_COMPAT_SHADER_PATH: shaderCache,
        STEAM_COMPAT_TOOL_PATHS: runnerPath,
        STEAM_ZENITY: '/usr/bin/zenity',
      },
      cwd,
    }
  }

  return {
    command: 'umu-run',
    args: [targetPath, ...targetArgs],
    env: {
      ...env,
      GAMEID: `umu-${steamAppId}`,
    },
    cwd,
  }
}

function spawnDetached(spec: ProtonLaunchSpec, options: DetachedSpawnOptions = {}): ChildProcess {
  const wrappedSpec = wrapWithGamescopeGrab(spec)
  const launchSpec = {
    ...spec,
    ...wrappedSpec,
  }
  let logFd: number | null = null

  try {
    if (options.logPath) {
      fs.mkdirSync(path.dirname(options.logPath), { recursive: true })
      const header = [
        `=== ${new Date().toISOString()} ===`,
        `command: ${launchSpec.command}`,
        `args: ${JSON.stringify(launchSpec.args)}`,
        `cwd: ${launchSpec.cwd}`,
        '',
      ].join('\n')
      fs.writeFileSync(options.logPath, header, 'utf-8')
      logFd = fs.openSync(options.logPath, 'a')
    }

    return spawn(launchSpec.command, launchSpec.args, {
      env: spec.env,
      detached: true,
      stdio: logFd === null ? 'ignore' : ['ignore', logFd, logFd],
      cwd: spec.cwd,
    })
  } finally {
    if (logFd !== null) {
      fs.closeSync(logFd)
    }
  }
}

function getWuwaRuntimeLogPath(): string {
  const paths = getPathsInstance()
  const logsDir = path.join(paths.cache, 'logs')
  fs.mkdirSync(logsDir, { recursive: true })
  return path.join(logsDir, 'wuwa-runtime-latest.log')
}

function writeWuwaLaunchDebugLog(
  game: Pick<Game, 'slug' | 'directory'>,
  mode: 'launcher' | 'direct',
  spec: ProtonLaunchSpec
): void {
  if (game.slug !== 'wuwa') {
    return
  }

  const paths = getPathsInstance()
  const logsDir = path.join(paths.cache, 'logs')
  fs.mkdirSync(logsDir, { recursive: true })
  const wrappedSpec = {
    ...spec,
    ...wrapWithGamescopeGrab(spec),
  }

  const payload = {
    timestamp: new Date().toISOString(),
    mode,
    directory: game.directory,
    runtimeLogPath: getWuwaRuntimeLogPath(),
    command: wrappedSpec.command,
    args: wrappedSpec.args,
    cwd: wrappedSpec.cwd,
    env: {
      GAMEID: wrappedSpec.env.GAMEID || '',
      PROTONPATH: wrappedSpec.env.PROTONPATH || '',
      PROTONFIXES_DISABLE: wrappedSpec.env.PROTONFIXES_DISABLE || '',
      SteamOS: wrappedSpec.env.SteamOS || '',
      STEAM_COMPAT_APP_ID: wrappedSpec.env.STEAM_COMPAT_APP_ID || '',
      STEAM_COMPAT_CONFIG: wrappedSpec.env.STEAM_COMPAT_CONFIG || '',
      STEAM_COMPAT_DATA_PATH: wrappedSpec.env.STEAM_COMPAT_DATA_PATH || '',
      STEAM_COMPAT_INSTALL_PATH: wrappedSpec.env.STEAM_COMPAT_INSTALL_PATH || '',
      STEAM_COMPAT_LIBRARY_PATHS: wrappedSpec.env.STEAM_COMPAT_LIBRARY_PATHS || '',
      STEAM_COMPAT_SHADER_PATH: wrappedSpec.env.STEAM_COMPAT_SHADER_PATH || '',
      STEAM_COMPAT_TOOL_PATHS: wrappedSpec.env.STEAM_COMPAT_TOOL_PATHS || '',
      WINEDLLOVERRIDES: wrappedSpec.env.WINEDLLOVERRIDES || '',
      WINEPREFIX: wrappedSpec.env.WINEPREFIX || '',
    },
  }

  const latestPath = path.join(logsDir, 'wuwa-launch-latest.json')
  const stampedPath = path.join(logsDir, `wuwa-launch-${Date.now()}.json`)
  const content = `${JSON.stringify(payload, null, 2)}\n`
  fs.writeFileSync(latestPath, content, 'utf-8')
  fs.writeFileSync(stampedPath, content, 'utf-8')
}

export async function launchGameWithXXMI(
  game: Game,
  runnerPath: string,
  winePrefix: string
): Promise<{ success: boolean; pid?: number; error?: string }> {
  const executablePath = game.executable
  const gameDirectory = game.directory
  const gameModConfig = getGameModConfig(executablePath)
  const importer = gameModConfig?.importer ?? null

  if (!importer) {
    return { success: false, error: 'No XXMI importer found for this game' }
  }

  if (!isXXMIInstalled()) {
    console.log('[xxmi] XXMI not found, downloading...')
    const result = await downloadXXMI((percent) => {
      console.log(`[xxmi] Download: ${percent}%`)
    })
    if (!result.success) {
      return result
    }
  }

  const isProtonRunner = fs.existsSync(path.join(runnerPath, 'proton'))
  const { winePrefix: normalizedWinePrefix, compatDataPath } = resolveProtonCompatPaths(winePrefix)
  const requestedGameEnv = game.launch.env || {}
  const wuwaLaunchMode = importer === 'WWMI' && game.slug === 'wuwa' ? resolveWuwaWwmiLaunchMode(game) : null
  const gameEnv =
    game.slug === 'wuwa'
      ? normalizeWuwaLaunchEnv(requestedGameEnv, wuwaLaunchMode || undefined).env
      : requestedGameEnv
  const useUmu = !!gameModConfig?.umuGameId && !(importer === 'WWMI' && isProtonRunner)

  const exeName = path.basename(executablePath).toLowerCase()

  if (exeName === 'starrail.exe') {
    const dbghelpResult = ensureStarRailDbghelp(path.dirname(executablePath))
    if (!dbghelpResult.success) {
      return dbghelpResult
    }
  }

  // For non-HoYo games using a bundled wine runner (not a Proton runner), need the bundled runner
  if (!useUmu && !isProtonRunner) {
    const runner = findInstalledRunner()
    if (!runner) {
      return { success: false, error: 'No Proton runner found. Please install a runner first.' }
    }
  }

  if (!isImporterInstalled(importer)) {
    console.log(`[xxmi] ${importer} not installed, downloading...`)
    const result = await downloadImporter(importer, (p) => console.log(`[xxmi] ${importer} download: ${p}%`))
    if (!result.success) return result
  }

  const gameFolder = importer === 'WWMI' ? gameDirectory : path.dirname(executablePath)
  configureImporterGameFolder(importer, gameFolder, executablePath)
  ensureLinuxCompatibility(importer, executablePath)

  console.log(`[xxmi] Using XXMI Launcher inject mode for ${importer}`)

  try {
    execSync('pkill -9 -f "Endfield" 2>/dev/null || true')
    execSync('pkill -9 -f "umu-run" 2>/dev/null || true')
  } catch {
    // Ignore errors
  }

  return new Promise((resolve) => {
    const { launcherExe } = getXXMIPaths()

    console.log(`[xxmi] Launching ${path.basename(executablePath)} with ${importer} (umu=${useUmu})`)

    let proc: ChildProcess
    if (useUmu) {
      // HoYo games: use umu-run so ProtonFixes applies UMU_USE_STEAM=1 for anti-cheat
      // Merge game-specific env vars (e.g. MHYPBase bypass), combining WINEDLLOVERRIDES
      const xxmiOverrides = 'd3d11=n,b;dxgi=n,b'
      const gameOverrides = gameEnv.WINEDLLOVERRIDES || ''
      const mergedOverrides = gameOverrides ? `${gameOverrides};${xxmiOverrides}` : xxmiOverrides
      const env = {
        ...process.env,
        ...gameEnv,
        GAMEID: gameModConfig?.umuGameId,
        PROTONPATH: runnerPath,
        WINEPREFIX: normalizedWinePrefix,
        STEAM_COMPAT_DATA_PATH: compatDataPath,
        WINEDLLOVERRIDES: mergedOverrides,
      }
      const wrappedLaunch = wrapWithGamescopeGrab({
        command: 'umu-run',
        args: [launcherExe, '--nogui', '--xxmi', importer],
      })
      console.log(`[xxmi] umu-run env: WINEDLLOVERRIDES=${env.WINEDLLOVERRIDES} STUB_WINTRUST=${gameEnv.STUB_WINTRUST} BLOCK_FIRST_REQ=${gameEnv.BLOCK_FIRST_REQ} STEAM_COMPAT_CONFIG=${gameEnv.STEAM_COMPAT_CONFIG}`)
      proc = spawn(wrappedLaunch.command, wrappedLaunch.args, {
        env,
        detached: true,
        stdio: 'ignore',
        cwd: path.dirname(launcherExe),
      })
    } else if (isProtonRunner) {
      // Non-HoYo games with a Proton runner (e.g. WuWa with proton-cachyos)
      const env = {
        ...process.env,
        ...gameEnv,
        PROTONPATH: runnerPath,
        WINEPREFIX: normalizedWinePrefix,
        STEAM_COMPAT_DATA_PATH: compatDataPath,
        GAMEID: gameModConfig?.umuGameId || '0',
        STEAM_COMPAT_APP_ID: gameModConfig?.steamAppId || '0',
        PROTONFIXES_DISABLE: '1',
      }

      if (importer === 'WWMI' && game.slug === 'wuwa') {
        const steamAppId = gameModConfig?.steamAppId || '0'
        if (wuwaLaunchMode === 'direct') {
          prepareStandaloneWwmiRuntime(executablePath)
          const runtimeLogPath = getWuwaRuntimeLogPath()
          const gameLaunch = buildProtonLaunchSpec(
            executablePath,
            WWMI_DIRECT_LAUNCH_ARGS,
            runnerPath,
            winePrefix,
            gameDirectory,
            gameEnv,
            steamAppId,
            mergeWindowsOverrides(WWMI_KURO_DLL_OVERRIDES, gameEnv.WINEDLLOVERRIDES)
          )

          writeWuwaLaunchDebugLog(game, 'direct', gameLaunch)
          console.log(
            `[wwmi] Launching WuWa via direct Proton client path cwd=${gameLaunch.cwd} ` +
            `WINEDLLOVERRIDES=${gameLaunch.env.WINEDLLOVERRIDES || ''} ` +
            `PROTONFIXES_DISABLE=${gameLaunch.env.PROTONFIXES_DISABLE || ''} ` +
            `STEAM_COMPAT_CONFIG=${gameLaunch.env.STEAM_COMPAT_CONFIG || ''} ` +
            `SteamOS=${gameLaunch.env.SteamOS || ''}`
          )
          proc = spawnDetached(gameLaunch, { logPath: runtimeLogPath })
        } else {
          cleanupStandaloneWwmiRuntime(executablePath)
          const runtimeLogPath = getWuwaRuntimeLogPath()
          const launcherLaunch = buildProtonLaunchSpec(
            launcherExe,
            ['--nogui', '--xxmi', importer],
            runnerPath,
            winePrefix,
            gameDirectory,
            gameEnv,
            steamAppId,
            mergeWindowsOverrides(gameEnv.WINEDLLOVERRIDES, 'd3d11=n,b;dxgi=n,b'),
            true,
            path.dirname(launcherExe)
          )

          writeWuwaLaunchDebugLog(game, 'launcher', launcherLaunch)
          console.log(
            `[wwmi] Launching WuWa via WWMI launcher path cwd=${launcherLaunch.cwd} ` +
            `WINEDLLOVERRIDES=${launcherLaunch.env.WINEDLLOVERRIDES || ''} ` +
            `PROTONFIXES_DISABLE=${launcherLaunch.env.PROTONFIXES_DISABLE || ''} ` +
            `STEAM_COMPAT_CONFIG=${launcherLaunch.env.STEAM_COMPAT_CONFIG || ''} ` +
            `SteamOS=${launcherLaunch.env.SteamOS || ''}`
          )
          proc = spawnDetached(launcherLaunch, { logPath: runtimeLogPath })
        }
        proc.unref()
      } else {
        const wrappedLaunch = wrapWithGamescopeGrab({
          command: 'umu-run',
          args: [launcherExe, '--nogui', '--xxmi', importer],
        })
        proc = spawn(wrappedLaunch.command, wrappedLaunch.args, {
          env,
          detached: true,
          stdio: 'ignore',
          cwd: path.dirname(launcherExe),
        })
      }
    } else {
      // Non-HoYo games with bundled wine runner (Endfield etc.)
      const runner = findInstalledRunner()!
      const env = {
        ...process.env,
        WINEPREFIX: winePrefix,
        WINEARCH: 'win64',
        DISABLE_WAYLAND: '1',
        GDK_BACKEND: 'x11',
        QT_QPA_PLATFORM: 'xcb',
        DXVK_STATE_CACHE_PATH: winePrefix,
        WINEDLLOVERRIDES: 'd3d11=n,b;dxgi=n,b',
      }
      const wrappedLaunch = wrapWithGamescopeGrab({
        command: runner.wine,
        args: [launcherExe, '--nogui', '--xxmi', importer],
      })
      proc = spawn(wrappedLaunch.command, wrappedLaunch.args, {
        env,
        detached: true,
        stdio: 'ignore',
        cwd: path.dirname(launcherExe),
      })
    }

    proc.unref()

    proc.on('error', (err) => {
      console.error(`[xxmi] Failed to start:`, err)
      resolve({ success: false, error: `Failed to start XXMI: ${err.message}` })
    })

    setTimeout(() => {
      if (proc.pid) {
        if (!isImporterInstalled(importer)) {
          console.log(`[xxmi] XXMI started (PID ${proc.pid}) — ${importer} not yet installed, XXMI will download and install it before launching the game`)
        } else {
          console.log(`[xxmi] XXMI started with PID ${proc.pid}`)
        }
        resolve({ success: true, pid: proc.pid })
      } else {
        resolve({ success: false, error: 'XXMI failed to start' })
      }
    }, 3000)

    proc.on('close', (code) => {
      console.log(`[xxmi] XXMI exited with code ${code}`)
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Mod Management
// ─────────────────────────────────────────────────────────────────────────────

export function getModsPath(importer: string): string {
  const { xxmiDir } = getXXMIPaths()
  return path.join(xxmiDir, importer, 'Mods')
}

function parseModFolderName(folderName: string): { displayName: string; originalName: string } {
  const customMatch = folderName.match(/^\((.+)\)(.+)$/)
  if (customMatch) {
    return {
      displayName: customMatch[1],
      originalName: customMatch[2],
    }
  }
  return {
    displayName: folderName,
    originalName: folderName,
  }
}

export function getMods(importer: string): Mod[] {
  const modsPath = getModsPath(importer)

  if (!fs.existsSync(modsPath)) {
    return []
  }

  const entries = fs.readdirSync(modsPath, { withFileTypes: true })
  const excludeFolders = ['ShaderCache', 'ShaderFixes', 'Core']

  return entries
    .filter(e => e.isDirectory() && !excludeFolders.includes(e.name))
    .map(e => {
      const isDisabled = e.name.startsWith(DISABLED_MOD_PREFIX)
      const cleanFolder = stripDisabledModPrefix(e.name)
      const { displayName, originalName } = parseModFolderName(cleanFolder)

      return {
        name: displayName,
        originalName,
        folder: e.name,
        enabled: !isDisabled,
        path: path.join(modsPath, e.name),
      }
    })
}

export function toggleMod(modPath: string, enabled: boolean): boolean {
  const dir = path.dirname(modPath)
  const folder = path.basename(modPath)
  const isCurrentlyDisabled = folder.startsWith(DISABLED_MOD_PREFIX)

  try {
    if (enabled && isCurrentlyDisabled) {
      const newName = stripDisabledModPrefix(folder)
      fs.renameSync(modPath, path.join(dir, newName))
      return true
    } else if (!enabled && !isCurrentlyDisabled) {
      fs.renameSync(modPath, path.join(dir, addDisabledModPrefix(folder, true)))
      return true
    }
    return true
  } catch (err) {
    console.error(`[mods] Failed to toggle mod:`, err)
    return false
  }
}

export function renameMod(modPath: string, customName: string): { success: boolean; newPath?: string; error?: string } {
  const dir = path.dirname(modPath)
  const folder = path.basename(modPath)

  const isDisabled = folder.startsWith(DISABLED_MOD_PREFIX)
  const cleanFolder = stripDisabledModPrefix(folder)
  const { originalName } = parseModFolderName(cleanFolder)

  try {
    const trimmedCustomName = customName.trim()
    const renamedFolder = trimmedCustomName
      ? `(${trimmedCustomName})${originalName}`
      : originalName
    const newFolderName = addDisabledModPrefix(renamedFolder, isDisabled)

    if (folder === newFolderName) {
      return { success: true, newPath: modPath }
    }

    const newPath = path.join(dir, newFolderName)
    fs.renameSync(modPath, newPath)
    return { success: true, newPath }
  } catch (err) {
    console.error(`[mods] Failed to rename mod:`, err)
    return { success: false, error: String(err) }
  }
}

export async function installMod(importer: string, sourcePath: string): Promise<{ success: boolean; error?: string }> {
  const modsPath = getModsPath(importer)

  if (!fs.existsSync(modsPath)) {
    fs.mkdirSync(modsPath, { recursive: true })
  }

  if (!fs.existsSync(sourcePath)) {
    return { success: false, error: 'Selected mod source does not exist' }
  }

  const sourceStat = fs.statSync(sourcePath)
  const modName = path.basename(sourcePath, sourceStat.isDirectory() ? '' : path.extname(sourcePath))
  const destPath = path.join(modsPath, modName)

  if (fs.existsSync(destPath) || fs.existsSync(path.join(modsPath, addDisabledModPrefix(modName, true)))) {
    return { success: false, error: 'Mod already exists' }
  }

  if (sourceStat.isDirectory()) {
    try {
      fs.cpSync(sourcePath, destPath, { recursive: true, errorOnExist: true })
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to copy mod folder' }
    }
  }

  const ext = path.extname(sourcePath).toLowerCase()
  if (ext !== '.zip' && ext !== '.7z' && ext !== '.rar') {
    return { success: false, error: 'Only .zip, .7z, .rar, or folder sources are supported' }
  }

  return new Promise((resolve) => {
    const extract = ext === '.7z' || ext === '.rar'
      ? spawn('7z', ['x', '-y', `-o${destPath}`, sourcePath], { stdio: 'inherit' })
      : spawn('unzip', ['-o', sourcePath, '-d', destPath], { stdio: 'inherit' })

    extract.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true })
      } else {
        resolve({ success: false, error: `Failed to extract mod (exit code ${code})` })
      }
    })

    extract.on('error', (err) => {
      resolve({ success: false, error: `Extraction failed: ${err.message}` })
    })
  })
}

export function deleteMod(modPath: string): boolean {
  try {
    fs.rmSync(modPath, { recursive: true, force: true })
    return true
  } catch (err) {
    console.error(`[mods] Failed to delete mod:`, err)
    return false
  }
}

export function enableAllMods(importer: string): void {
  const mods = getMods(importer)
  for (const mod of mods) {
    if (!mod.enabled) {
      toggleMod(mod.path, true)
    }
  }
}

export function disableAllMods(importer: string): void {
  const mods = getMods(importer)
  for (const mod of mods) {
    if (mod.enabled) {
      toggleMod(mod.path, false)
    }
  }
}
