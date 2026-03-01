import { spawn, execSync } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as https from 'https'
import { getPathsInstance } from './paths'
import type { Mod } from '../../shared/types/game'

const XXMI_RELEASES_API = 'https://api.github.com/repos/SpectrumQT/XXMI-Launcher/releases/latest'
const PROTON_GE_RELEASES_API = 'https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases/latest'

const GAME_TO_XXMI_IMPORTER: Record<string, string> = {
  'endfield.exe': 'EFMI',
  'genshinimpact.exe': 'GIMI',
  'starrail.exe': 'SRMI',
  'zenlesszonezero.exe': 'ZZMI',
  'bh3.exe': 'HIMI',
  'client-win64-shipping.exe': 'WWMI',
}

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
            resolve(JSON.parse(data))
          } catch {
            console.error('[github] Failed to parse API response')
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
            fs.unlinkSync(destPath)
            downloadWithRedirect(redirectUrl, redirectCount + 1)
            return
          }
        }

        if (response.statusCode !== 200) {
          file.close()
          fs.unlinkSync(destPath)
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
          fs.unlinkSync(destPath)
          resolve({ success: false, error: `Write failed: ${err.message}` })
        })
      }).on('error', (err) => {
        console.error('[download] Download error:', err)
        file.close()
        fs.unlinkSync(destPath)
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
      fs.unlinkSync(archivePath)
      if (code === 0) {
        resolve({ success: true })
      } else {
        resolve({ success: false, error: `Extraction failed (exit code ${code})` })
      }
    })

    command.on('error', (err) => {
      console.error('[extract] Error:', err)
      fs.unlinkSync(archivePath)
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

function linuxToWinePath(linuxPath: string): string {
  return 'Z:' + linuxPath.replace(/\/+/g, '/')
}

function configureImporterGameFolder(importer: string, gameDirectory: string): boolean {
  const { xxmiDir } = getXXMIPaths()
  const configPath = path.join(xxmiDir, 'XXMI Launcher Config.json')

  if (!fs.existsSync(configPath)) return false

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const winePath = linuxToWinePath(gameDirectory)

    if (config?.Importers?.[importer]?.Importer) {
      config.Importers[importer].Importer.game_folder = winePath
      config.Importers[importer].Importer.process_start_method = 'Shell'
      config.Importers[importer].Importer.custom_launch_inject_mode = 'Hook'

      if (config?.Launcher) {
        config.Launcher.active_importer = importer
        if (!config.Launcher.enabled_importers.includes(importer)) {
          config.Launcher.enabled_importers.push(importer)
        }
      }

      fs.writeFileSync(configPath, JSON.stringify(config, null, 4))
      console.log(`[xxmi] Configured ${importer} with game folder: ${winePath}`)
      return true
    }
    return false
  } catch (err) {
    console.error('[xxmi] Failed to configure importer:', err)
    return false
  }
}

function ensureLinuxCompatibility(importer: string): void {
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

      // Don't force Hook mode for EFMI - it has anti-cheat and requires Inject mode
      if (importer !== 'EFMI' && importerConfig.custom_launch_inject_mode !== 'Hook') {
        importerConfig.custom_launch_inject_mode = 'Hook'
        needsSave = true
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

export async function launchGameWithXXMI(
  executablePath: string,
  _gameDirectory: string,
  _runnerPath: string,
  winePrefix: string
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

  const runner = findInstalledRunner()
  if (!runner) {
    return {
      success: false,
      error: 'No Proton runner found. Please install a runner first.',
    }
  }

  const gameFolder = path.dirname(executablePath)

  configureImporterGameFolder(importer, gameFolder)
  ensureLinuxCompatibility(importer)

  console.log(`[xxmi] Using XXMI Launcher inject mode for ${importer}`)

  // Kill any existing zombie processes
  try {
    execSync('pkill -9 -f "Endfield" 2>/dev/null || true')
    execSync('pkill -9 -f "umu-run" 2>/dev/null || true')
  } catch {
    // Ignore errors
  }

  return new Promise((resolve) => {
    const { launcherExe } = getXXMIPaths()

    console.log(`[xxmi] Launching ${path.basename(executablePath)} with ${importer}`)

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

    const proc = spawn(runner.wine, [launcherExe, '--nogui', '--xxmi', importer], {
      env,
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(launcherExe),
    })

    proc.on('error', (err) => {
      console.error(`[xxmi] Failed to start:`, err)
      resolve({ success: false, error: `Failed to start XXMI: ${err.message}` })
    })

    setTimeout(() => {
      if (proc.pid) {
        console.log(`[xxmi] XXMI started with PID ${proc.pid}`)
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
      const isDisabled = e.name.startsWith('DISABLED_')
      const cleanFolder = isDisabled ? e.name.substring(9) : e.name
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
  const isCurrentlyDisabled = folder.startsWith('DISABLED_')

  try {
    if (enabled && isCurrentlyDisabled) {
      const newName = folder.substring(9)
      fs.renameSync(modPath, path.join(dir, newName))
      return true
    } else if (!enabled && !isCurrentlyDisabled) {
      fs.renameSync(modPath, path.join(dir, 'DISABLED_' + folder))
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

  const isDisabled = folder.startsWith('DISABLED_')
  const cleanFolder = isDisabled ? folder.substring(9) : folder
  const { originalName } = parseModFolderName(cleanFolder)

  try {
    let newFolderName: string
    if (customName && customName.trim()) {
      newFolderName = `(${customName.trim()})${originalName}`
    } else {
      newFolderName = originalName
    }

    if (isDisabled) {
      newFolderName = 'DISABLED_' + newFolderName
    }

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

export async function installMod(importer: string, zipPath: string): Promise<{ success: boolean; error?: string }> {
  const modsPath = getModsPath(importer)

  if (!fs.existsSync(modsPath)) {
    fs.mkdirSync(modsPath, { recursive: true })
  }

  const modName = path.basename(zipPath, path.extname(zipPath))
  const destPath = path.join(modsPath, modName)

  if (fs.existsSync(destPath) || fs.existsSync(path.join(modsPath, 'DISABLED_' + modName))) {
    return { success: false, error: 'Mod already exists' }
  }

  return new Promise((resolve) => {
    const extract = spawn('unzip', ['-o', zipPath, '-d', destPath], { stdio: 'inherit' })

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
