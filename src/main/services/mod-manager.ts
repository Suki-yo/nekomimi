import { spawn, execSync } from 'child_process'
import type { ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as https from 'https'
import { getPathsInstance } from './paths'
import { findSteamrt } from './steamrt'
import type { Mod } from '../../shared/types/game'

const XXMI_RELEASES_API = 'https://api.github.com/repos/SpectrumQT/XXMI-Launcher/releases/latest'
const PROTON_GE_RELEASES_API = 'https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases/latest'
const XXMI_LIBS_RELEASES_API = 'https://api.github.com/repos/SpectrumQT/XXMI-Libs-Package/releases/latest'

const IMPORTER_RELEASES_API: Record<string, string> = {
  GIMI: 'https://api.github.com/repos/SilentNightSound/GIMI-Package/releases/latest',
  SRMI: 'https://api.github.com/repos/SpectrumQT/SRMI-Package/releases/latest',
  ZZMI: 'https://api.github.com/repos/leotorrez/ZZMI-Package/releases/latest',
  EFMI: 'https://api.github.com/repos/SpectrumQT/EFMI-Package/releases/latest',
  HIMI: 'https://api.github.com/repos/leotorrez/HIMI-Package/releases/latest',
  WWMI: 'https://api.github.com/repos/SpectrumQT/WWMI-Package/releases/latest',
}

const GAME_TO_XXMI_IMPORTER: Record<string, string> = {
  'endfield.exe': 'EFMI',
  'genshinimpact.exe': 'GIMI',
  'starrail.exe': 'SRMI',
  'zenlesszonezero.exe': 'ZZMI',
  'bh3.exe': 'HIMI',
  'client-win64-shipping.exe': 'WWMI',
}

// HoYo games need umu-run (for UMU_USE_STEAM=1 anti-cheat fix)
const GAME_TO_UMU_GAMEID: Record<string, string> = {
  'genshinimpact.exe': 'umu-genshin',
  'zenlesszonezero.exe': 'umu-zenlesszonezero',
  'starrail.exe': '0',
  'client-win64-shipping.exe': 'umu-3513350',
}

const GAME_TO_STEAM_APPID: Record<string, string> = {
  'client-win64-shipping.exe': '3513350',
}

const DISABLED_MOD_PREFIX = 'DISABLED_'
const WWMI_PROCESS_EXE_NAMES = ['Client-Win64-Shipping.exe']
const WWMI_LAUNCH_OPTIONS = '-dx11'

export function shouldUseXXMI(executablePath: string): boolean {
  const exeName = path.basename(executablePath).toLowerCase()
  return !!GAME_TO_XXMI_IMPORTER[exeName]
}

export function getXXMIImporter(executablePath: string): string | null {
  const exeName = path.basename(executablePath).toLowerCase()
  return GAME_TO_XXMI_IMPORTER[exeName] || null
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

function usesInjectMode(importer: string): boolean {
  return importer === 'EFMI' || importer === 'GIMI'
}

function applyWWMILaunchSettings(importerConfig: Record<string, unknown>): void {
  importerConfig.custom_launch_enabled = false
  importerConfig.custom_launch = ''
  importerConfig.custom_launch_signature = ''
  importerConfig.use_launch_options = true
  importerConfig.launch_options = WWMI_LAUNCH_OPTIONS
  importerConfig.process_exe_names = WWMI_PROCESS_EXE_NAMES
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

// Twintail keeps WWMI configured for XXMI Launcher ownership rather than directly
// rewriting the package into a standalone 3dmloader flow.
function configureWWMILaunchPath(_gameExecutable: string): void {
  const { xxmiDir } = getXXMIPaths()
  const d3dxIni = path.join(xxmiDir, 'WWMI', 'd3dx.ini')
  if (!fs.existsSync(d3dxIni)) return

  let content = fs.readFileSync(d3dxIni, 'utf-8')
  content = content.replace(/^loader\s*=.*$/m, 'loader = XXMI Launcher.exe')
  content = content.replace(/^;?\s*require_admin\s*=.*$/m, 'require_admin = true')
  content = content.replace(/^;launch\s*=.*$/m, 'launch = $\\xxmi\\config\\game_exe_path')
  content = content.replace(/^;?delay\s*=.*$/m, 'delay = 0')

  fs.writeFileSync(d3dxIni, content)
  console.log('[wwmi] d3dx.ini: restored XXMI launcher mode')
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

    if (!fs.existsSync(rootPath) || fs.existsSync(importerPath)) continue

    try {
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
  const apiUrl = IMPORTER_RELEASES_API[importer]
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

  if (!fs.existsSync(configPath)) return false

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const winePath = linuxToWinePath(gameDirectory)

    // Always update Launcher section regardless of whether importer is installed yet
    if (config?.Launcher) {
      config.Launcher.active_importer = importer
      if (!config.Launcher.enabled_importers.includes(importer)) {
        config.Launcher.enabled_importers.push(importer)
      }
    }

    if (config?.Importers?.[importer]?.Importer) {
      // Importer already installed — update game folder and mode
      const useInjectMode = usesInjectMode(importer)
      const importerConfig = config.Importers[importer].Importer
      importerConfig.game_folder = winePath
      importerConfig.process_start_method = 'Shell'
      importerConfig.custom_launch_inject_mode = useInjectMode ? 'Inject' : 'Hook'
      if (importer === 'WWMI') {
        applyWWMILaunchSettings(importerConfig)
      }
    } else {
      // Importer just installed via downloadImporter — seed a minimal config stub so
      // XXMI finds a valid Importers section and doesn't show its own install dialog.
      const useInjectMode = usesInjectMode(importer)
      const importerConfig: Record<string, unknown> = {
        game_folder: winePath,
        process_start_method: 'Shell',
        custom_launch_inject_mode: useInjectMode ? 'Inject' : 'Hook',
      }

      if (importer === 'WWMI') {
        applyWWMILaunchSettings(importerConfig)
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

  if (!fs.existsSync(configPath)) return

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

    if (config?.Importers?.[importer]?.Importer) {
      const importerConfig = config.Importers[importer].Importer
      let needsSave = false

      if (importerConfig.process_start_method !== 'Shell') {
        importerConfig.process_start_method = 'Shell'
        needsSave = true
      }

      // EFMI and GIMI use Inject mode; WWMI uses Hook mode (DLL loaded before d3d11 initializes)
      const useInjectMode = usesInjectMode(importer)
      const targetMode = useInjectMode ? 'Inject' : 'Hook'
      if (importerConfig.custom_launch_inject_mode !== targetMode) {
        importerConfig.custom_launch_inject_mode = targetMode
        needsSave = true
      }

      if (importer === 'WWMI') {
        if (importerConfig.custom_launch_enabled !== false) {
          importerConfig.custom_launch_enabled = false
          needsSave = true
        }
        if (importerConfig.custom_launch !== '') {
          importerConfig.custom_launch = ''
          needsSave = true
        }
        if (importerConfig.custom_launch_signature !== '') {
          importerConfig.custom_launch_signature = ''
          needsSave = true
        }
        if (importerConfig.use_launch_options !== true) {
          importerConfig.use_launch_options = true
          needsSave = true
        }
        if (importerConfig.launch_options !== WWMI_LAUNCH_OPTIONS) {
          importerConfig.launch_options = WWMI_LAUNCH_OPTIONS
          needsSave = true
        }
        const processExeNames = JSON.stringify(importerConfig.process_exe_names || [])
        if (processExeNames !== JSON.stringify(WWMI_PROCESS_EXE_NAMES)) {
          importerConfig.process_exe_names = WWMI_PROCESS_EXE_NAMES
          needsSave = true
        }
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

function buildProtonLaunchSpec(
  targetPath: string,
  targetArgs: string[],
  runnerPath: string,
  winePrefix: string,
  gameDirectory: string,
  gameEnv: Record<string, string>,
  steamAppId: string,
  windowsOverrides?: string
): ProtonLaunchSpec {
  const prefixParent = winePrefix.replace(/\/pfx\/?$/, '')
  const steamrt = findSteamrt()

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...gameEnv,
    PROTONPATH: runnerPath,
    WINEPREFIX: winePrefix,
    STEAM_COMPAT_DATA_PATH: prefixParent,
    STEAM_COMPAT_APP_ID: steamAppId,
    PROTONFIXES_DISABLE: '1',
    WINEARCH: 'win64',
  }

  if (windowsOverrides) {
    env.WINEDLLOVERRIDES = windowsOverrides
  }

  if (steamrt) {
    const shaderCache = path.join(prefixParent, 'shadercache')
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
        STEAM_COMPAT_LIBRARY_PATHS: `${gameDirectory}:${winePrefix}`,
        STEAM_COMPAT_SHADER_PATH: shaderCache,
        STEAM_COMPAT_TOOL_PATHS: runnerPath,
        STEAM_ZENITY: '/usr/bin/zenity',
      },
      cwd: path.dirname(targetPath),
    }
  }

  return {
    command: 'umu-run',
    args: [targetPath, ...targetArgs],
    env: {
      ...env,
      GAMEID: `umu-${steamAppId}`,
    },
    cwd: path.dirname(targetPath),
  }
}

function spawnDetached(spec: ProtonLaunchSpec): ChildProcess {
  return spawn(spec.command, spec.args, {
    env: spec.env,
    detached: true,
    stdio: 'ignore',
    cwd: spec.cwd,
  })
}

export async function launchGameWithXXMI(
  executablePath: string,
  gameDirectory: string,
  runnerPath: string,
  winePrefix: string,
  gameEnv: Record<string, string> = {}
): Promise<{ success: boolean; error?: string }> {
  const importer = getXXMIImporter(executablePath)

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

  const exeName = path.basename(executablePath).toLowerCase()
  const gameId = GAME_TO_UMU_GAMEID[exeName]
  const useUmu = !!gameId
  const isProtonRunner = !useUmu && fs.existsSync(path.join(runnerPath, 'proton'))

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

  const gameFolder = path.dirname(executablePath)
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
        GAMEID: gameId,
        PROTONPATH: runnerPath,
        WINEPREFIX: winePrefix,
        STEAM_COMPAT_DATA_PATH: winePrefix.replace(/\/pfx\/?$/, ''),
        WINEDLLOVERRIDES: mergedOverrides,
      }
      console.log(`[xxmi] umu-run env: WINEDLLOVERRIDES=${env.WINEDLLOVERRIDES} STUB_WINTRUST=${gameEnv.STUB_WINTRUST} BLOCK_FIRST_REQ=${gameEnv.BLOCK_FIRST_REQ} STEAM_COMPAT_CONFIG=${gameEnv.STEAM_COMPAT_CONFIG}`)
      proc = spawn('umu-run', [launcherExe, '--nogui', '--xxmi', importer], {
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
        WINEPREFIX: winePrefix,
        STEAM_COMPAT_DATA_PATH: winePrefix.replace(/\/pfx\/?$/, ''),
        GAMEID: gameId || '0',
        STEAM_COMPAT_APP_ID: GAME_TO_STEAM_APPID[exeName] || '0',
        PROTONFIXES_DISABLE: '1',
      }

      if (importer === 'WWMI') {
        configureWWMILaunchPath(executablePath)
        const { xxmiDir } = getXXMIPaths()
        const loaderDir = path.join(xxmiDir, 'WWMI')
        ensureImporterRootSymlinks(loaderDir)
        ensureWindowsDllAliases(loaderDir)
        const sharedWineEnv = {
          ...env,
          WINEARCH: 'win64',
          WINEDLLOVERRIDES: gameEnv.WINEDLLOVERRIDES
            ? `d3d11=n,b;dxgi=n,b;${gameEnv.WINEDLLOVERRIDES}`
            : 'd3d11=n,b;dxgi=n,b',
        }

        const steamAppId = GAME_TO_STEAM_APPID[exeName] || '0'
        const loaderLaunch = buildProtonLaunchSpec(
          launcherExe,
          ['--nogui', '--xxmi', importer],
          runnerPath,
          winePrefix,
          gameDirectory,
          gameEnv,
          steamAppId,
          sharedWineEnv.WINEDLLOVERRIDES
        )
        const gameLaunch = buildProtonLaunchSpec(
          executablePath,
          ['-dx11'],
          runnerPath,
          winePrefix,
          gameDirectory,
          gameEnv,
          steamAppId,
          sharedWineEnv.WINEDLLOVERRIDES
        )

        proc = spawnDetached(loaderLaunch)
        proc.unref()

        setTimeout(() => {
          const gameProc = spawnDetached(gameLaunch)
          gameProc.unref()
          gameProc.on('error', (err) => {
            console.error('[xxmi] Failed to start WuWa after XXMI setup:', err)
          })
          gameProc.on('close', (code) => {
            console.log(`[xxmi] WuWa launch helper exited with code ${code}`)
          })
        }, 1500)
      } else {
        proc = spawn('umu-run', [launcherExe, '--nogui', '--xxmi', importer], {
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
      proc = spawn(runner.wine, [launcherExe, '--nogui', '--xxmi', importer], {
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
        resolve({ success: true })
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

  if (path.extname(sourcePath).toLowerCase() !== '.zip') {
    return { success: false, error: 'Only .zip archives or folders are supported' }
  }

  return new Promise((resolve) => {
    const extract = spawn('unzip', ['-o', sourcePath, '-d', destPath], { stdio: 'inherit' })

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
