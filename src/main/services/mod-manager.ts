import { spawn, execSync } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as https from 'https'
import { getPathsInstance } from './paths'
import type { Mod } from '../../shared/types/game'

// XXMI Launcher GitHub API URL for releases
const XXMI_RELEASES_API = 'https://api.github.com/repos/SpectrumQT/XXMI-Launcher/releases/latest'

// Proton-GE GitHub API URL for releases
const PROTON_GE_RELEASES_API = 'https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases/latest'

// Map game executables to XXMI importer names
const GAME_TO_XXMI_IMPORTER: Record<string, string> = {
  'endfield.exe': 'EFMI',
  'genshinimpact.exe': 'GIMI',
  'starrail.exe': 'SRMI',
  'zenlesszonezero.exe': 'ZZMI',
  'bh3.exe': 'HIMI',
  'client-win64-shipping.exe': 'WWMI', // Wuthering Waves
}

/**
 * Check if a game should use XXMI
 */
export function shouldUseXXMI(executablePath: string): boolean {
  const exeName = path.basename(executablePath).toLowerCase()
  return !!GAME_TO_XXMI_IMPORTER[exeName]
}

/**
 * Get the XXMI importer name for a game
 */
export function getXXMIImporter(executablePath: string): string | null {
  const exeName = path.basename(executablePath).toLowerCase()
  return GAME_TO_XXMI_IMPORTER[exeName] || null
}

/**
 * Get paths for XXMI components
 * The portable zip extracts to: Locale/, Resources/, Themes/
 * The launcher exe is at: Resources/Bin/XXMI Launcher.exe
 */
function getXXMIPaths() {
  const paths = getPathsInstance()
  return {
    xxmiDir: paths.xxmi,
    launcherExe: path.join(paths.xxmi, 'Resources', 'Bin', 'XXMI Launcher.exe'),
    launcherPrefix: path.join(paths.xxmi, 'prefix'),
    runnersDir: paths.runners,
  }
}

/**
 * Find the first installed Proton-GE runner
 */
function findInstalledRunner(): { name: string; path: string; wine: string } | null {
  const { runnersDir } = getXXMIPaths()
  if (!fs.existsSync(runnersDir)) return null

  const entries = fs.readdirSync(runnersDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    // Look for GE-Proton or proton-ge folders
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

/**
 * Check if XXMI is installed
 */
export function isXXMIInstalled(): boolean {
  const { launcherExe } = getXXMIPaths()
  return fs.existsSync(launcherExe)
}

/**
 * Check if a runner is installed
 */
export function isRunnerInstalled(): boolean {
  return findInstalledRunner() !== null
}

/**
 * Get the installed runner info
 */
export function getInstalledRunner(): { name: string; path: string; wine: string } | null {
  return findInstalledRunner()
}

/**
 * Fetch the portable download URL from GitHub API
 */
async function getXXMIPortableDownloadUrl(): Promise<{ url: string; version: string } | null> {
  return new Promise((resolve) => {
    const req = https.get(
      XXMI_RELEASES_API,
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
            const release = JSON.parse(data)
            // Find the portable zip asset (not the MSI installer)
            const portableAsset = release.assets?.find(
              (asset: { name: string; browser_download_url: string }) =>
                asset.name.includes('Portable') && asset.name.endsWith('.zip')
            )
            if (portableAsset) {
              resolve({
                url: portableAsset.browser_download_url,
                version: release.tag_name,
              })
            } else {
              console.error('[xxmi] No portable asset found in release')
              resolve(null)
            }
          } catch (err) {
            console.error('[xxmi] Failed to parse GitHub API response:', err)
            resolve(null)
          }
        })
      }
    )
    req.on('error', (err) => {
      console.error('[xxmi] GitHub API request failed:', err)
      resolve(null)
    })
    req.end()
  })
}

/**
 * Download XXMI Launcher (async, returns progress via callback)
 */
export async function downloadXXMI(
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; error?: string }> {
  const { xxmiDir } = getXXMIPaths()

  // Create directory if needed
  if (!fs.existsSync(xxmiDir)) {
    fs.mkdirSync(xxmiDir, { recursive: true })
  }

  // First, get the actual download URL from GitHub API
  console.log('[xxmi] Fetching release info from GitHub API...')
  const releaseInfo = await getXXMIPortableDownloadUrl()
  if (!releaseInfo) {
    return { success: false, error: 'Failed to get release info from GitHub' }
  }

  const { url: downloadUrl, version } = releaseInfo
  console.log(`[xxmi] Found XXMI ${version}, downloading from: ${downloadUrl}`)

  const zipPath = path.join(xxmiDir, 'xxmi-temp.zip')

  return new Promise<{ success: boolean; error?: string }>((resolve) => {
    const downloadFile = (url: string) => {
      const file = fs.createWriteStream(zipPath)

      https.get(url, (response) => {
        // Handle redirects (GitHub uses 302)
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            console.log('[xxmi] Redirecting to:', redirectUrl)
            file.close()
            fs.unlinkSync(zipPath)
            downloadFile(redirectUrl)
            return
          }
        }

        if (response.statusCode !== 200) {
          file.close()
          fs.unlinkSync(zipPath)
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
          console.log('[xxmi] Download complete, extracting...')

          // Extract using unzip command - use inherit to avoid buffer blocking
          const extract = spawn('unzip', ['-o', zipPath, '-d', xxmiDir], {
            stdio: 'inherit'
          })

          extract.on('close', (code) => {
            fs.unlinkSync(zipPath) // Clean up zip

            if (code === 0) {
              console.log('[xxmi] Extraction complete')
              resolve({ success: true })
            } else {
              console.error('[xxmi] Extraction failed with code:', code)
              resolve({ success: false, error: `Failed to extract XXMI (exit code ${code})` })
            }
          })

          extract.on('error', (err) => {
            console.error('[xxmi] Extraction error:', err)
            resolve({ success: false, error: `Extraction failed: ${err.message}` })
          })
        })

        file.on('error', (err) => {
          console.error('[xxmi] File write error:', err)
          file.close()
          fs.unlinkSync(zipPath)
          resolve({ success: false, error: `Write failed: ${err.message}` })
        })
      }).on('error', (err) => {
        console.error('[xxmi] Download error:', err)
        file.close()
        fs.unlinkSync(zipPath)
        resolve({ success: false, error: `Download failed: ${err.message}` })
      })
    }

    downloadFile(downloadUrl)
  }).catch((err: Error) => ({ success: false, error: err.message }))
}

/**
 * Fetch the Proton-GE download URL from GitHub API
 */
async function getProtonGEDownloadUrl(): Promise<{ url: string; version: string; size: number } | null> {
  return new Promise((resolve) => {
    const req = https.get(
      PROTON_GE_RELEASES_API,
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
            const release = JSON.parse(data)
            // Find the tar.gz asset
            const tarballAsset = release.assets?.find(
              (asset: { name: string; browser_download_url: string; size: number }) =>
                asset.name.endsWith('.tar.gz') && !asset.name.includes('.sha')
            )
            if (tarballAsset) {
              resolve({
                url: tarballAsset.browser_download_url,
                version: release.tag_name,
                size: tarballAsset.size,
              })
            } else {
              console.error('[runner] No tar.gz asset found in release')
              resolve(null)
            }
          } catch (err) {
            console.error('[runner] Failed to parse GitHub API response:', err)
            resolve(null)
          }
        })
      }
    )
    req.on('error', (err) => {
      console.error('[runner] GitHub API request failed:', err)
      resolve(null)
    })
    req.end()
  })
}

/**
 * Download Proton-GE runner (async, returns progress via callback)
 */
export async function downloadRunner(
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; error?: string }> {
  const { runnersDir } = getXXMIPaths()

  // Create directory if needed
  if (!fs.existsSync(runnersDir)) {
    fs.mkdirSync(runnersDir, { recursive: true })
  }

  // Get the download URL from GitHub API
  console.log('[runner] Fetching Proton-GE release info from GitHub API...')
  const releaseInfo = await getProtonGEDownloadUrl()
  if (!releaseInfo) {
    return { success: false, error: 'Failed to get release info from GitHub' }
  }

  const { url: downloadUrl, version } = releaseInfo
  console.log(`[runner] Found ${version}, downloading from: ${downloadUrl}`)

  const tarPath = path.join(runnersDir, 'proton-temp.tar.gz')

  return new Promise<{ success: boolean; error?: string }>((resolve) => {
    const downloadFile = (url: string) => {
      const file = fs.createWriteStream(tarPath)

      https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            console.log('[runner] Redirecting to:', redirectUrl)
            file.close()
            fs.unlinkSync(tarPath)
            downloadFile(redirectUrl)
            return
          }
        }

        if (response.statusCode !== 200) {
          file.close()
          fs.unlinkSync(tarPath)
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
          console.log('[runner] Download complete, extracting...')

          // Extract using tar - Proton-GE tarballs extract to a single folder like GE-Proton10-32/
          const extract = spawn('tar', ['-xzf', tarPath, '-C', runnersDir], {
            stdio: 'inherit'
          })

          extract.on('close', (code) => {
            fs.unlinkSync(tarPath) // Clean up tarball

            if (code === 0) {
              console.log('[runner] Extraction complete')
              resolve({ success: true })
            } else {
              console.error('[runner] Extraction failed with code:', code)
              resolve({ success: false, error: `Failed to extract runner (exit code ${code})` })
            }
          })

          extract.on('error', (err) => {
            console.error('[runner] Extraction error:', err)
            resolve({ success: false, error: `Extraction failed: ${err.message}` })
          })
        })

        file.on('error', (err) => {
          console.error('[runner] File write error:', err)
          file.close()
          fs.unlinkSync(tarPath)
          resolve({ success: false, error: `Write failed: ${err.message}` })
        })
      }).on('error', (err) => {
        console.error('[runner] Download error:', err)
        file.close()
        fs.unlinkSync(tarPath)
        resolve({ success: false, error: `Download failed: ${err.message}` })
      })
    }

    downloadFile(downloadUrl)
  }).catch((err: Error) => ({ success: false, error: err.message }))
}

/**
 * Check if an importer is deployed (has been set up)
 */
function isImporterDeployed(importer: string): boolean {
  const { xxmiDir } = getXXMIPaths()
  const configPath = path.join(xxmiDir, 'XXMI Launcher Config.json')

  if (!fs.existsSync(configPath)) return false

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return config?.Packages?.packages?.[importer]?.deployed_version !== ''
  } catch {
    return false
  }
}

/**
 * Convert Linux path to Windows Z: drive path for Wine
 * e.g., /home/user/games/Endfield -> Z:/home/user/games/Endfield
 */
function linuxToWinePath(linuxPath: string): string {
  // Convert forward slashes and add Z: prefix
  return 'Z:' + linuxPath.replace(/\/+/g, '/')
}

/**
 * Configure the game folder for an importer in XXMI config
 * Also adjusts settings for Linux/Proton compatibility
 */
function configureImporterGameFolder(importer: string, gameDirectory: string): boolean {
  const { xxmiDir } = getXXMIPaths()
  const configPath = path.join(xxmiDir, 'XXMI Launcher Config.json')

  if (!fs.existsSync(configPath)) return false

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

    // Convert to Windows path for Wine
    const winePath = linuxToWinePath(gameDirectory)

    // Set the game folder for the importer
    if (config?.Importers?.[importer]?.Importer) {
      config.Importers[importer].Importer.game_folder = winePath

      // Adjust settings for Linux/Proton compatibility
      // Use "Shell" start method instead of "Native" for better Wine/Proton support
      config.Importers[importer].Importer.process_start_method = 'Shell'
      // Use "Hook" injection mode instead of "Inject" for better compatibility
      config.Importers[importer].Importer.custom_launch_inject_mode = 'Hook'

      // Set as active importer
      if (config?.Launcher) {
        config.Launcher.active_importer = importer
        if (!config.Launcher.enabled_importers.includes(importer)) {
          config.Launcher.enabled_importers.push(importer)
        }
      }

      fs.writeFileSync(configPath, JSON.stringify(config, null, 4))
      console.log(`[xxmi] Configured ${importer} with game folder: ${winePath}`)
      console.log(`[xxmi] Set process_start_method=Shell, custom_launch_inject_mode=Hook for Linux/Proton`)
      return true
    }
    return false
  } catch (err) {
    console.error('[xxmi] Failed to configure importer:', err)
    return false
  }
}

/**
 * Ensure Linux/Proton compatibility settings are applied
 */
function ensureLinuxCompatibility(importer: string): void {
  const { xxmiDir } = getXXMIPaths()
  const configPath = path.join(xxmiDir, 'XXMI Launcher Config.json')

  if (!fs.existsSync(configPath)) return

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

    if (config?.Importers?.[importer]?.Importer) {
      const importerConfig = config.Importers[importer].Importer

      // Always ensure Linux/Proton compatible settings
      let needsSave = false

      if (importerConfig.process_start_method !== 'Shell') {
        importerConfig.process_start_method = 'Shell'
        needsSave = true
      }
      // NOTE: Don't force Hook mode for EFMI - it has anti-cheat and requires Inject mode
      // XXMI Launcher will automatically use Inject mode for anti-cheat games regardless
      if (importer !== 'EFMI' && importerConfig.custom_launch_inject_mode !== 'Hook') {
        importerConfig.custom_launch_inject_mode = 'Hook'
        needsSave = true
      }

      if (needsSave) {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4))
        console.log(`[xxmi] Updated ${importer} settings for Linux/Proton compatibility`)
      }
    }
  } catch (err) {
    console.error('[xxmi] Failed to ensure Linux compatibility:', err)
  }
}

/**
 * Deploy importer files to game folder (loader mode - no injection needed)
 * Copies d3d11.dll, d3dcompiler_47.dll, d3dx.ini to the game folder
 */
function deployImporterToGame(importer: string, gameFolder: string): boolean {
  const { xxmiDir } = getXXMIPaths()
  const importerDir = path.join(xxmiDir, importer)

  if (!fs.existsSync(importerDir)) {
    console.error(`[xxmi] Importer directory not found: ${importerDir}`)
    return false
  }

  const filesToCopy = ['d3d11.dll', 'd3dcompiler_47.dll', 'd3dx.ini']

  try {
    for (const file of filesToCopy) {
      const src = path.join(importerDir, file)
      const dst = path.join(gameFolder, file)
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst)
        console.log(`[xxmi] Deployed ${file} to game folder`)
      }
    }

    // Also copy Mods and ShaderFixes folders if they exist
    const foldersToCopy = ['Mods', 'ShaderFixes']
    for (const folder of foldersToCopy) {
      const srcFolder = path.join(importerDir, folder)
      const dstFolder = path.join(gameFolder, folder)
      if (fs.existsSync(srcFolder) && !fs.existsSync(dstFolder)) {
        fs.cpSync(srcFolder, dstFolder, { recursive: true })
        console.log(`[xxmi] Deployed ${folder}/ to game folder`)
      }
    }

    return true
  } catch (err) {
    console.error(`[xxmi] Failed to deploy importer files:`, err)
    return false
  }
}

/**
 * Check if importer is deployed to game folder
 */
function isImporterDeployedToGame(importer: string, gameFolder: string): boolean {
  const d3d11Path = path.join(gameFolder, 'd3d11.dll')
  const d3dxPath = path.join(gameFolder, 'd3dx.ini')
  return fs.existsSync(d3d11Path) && fs.existsSync(d3dxPath)
}

/**
 * Launch game with XXMI (loader mode)
 *
 * Deploys DLLs to game folder and launches directly with Proton.
 * No injection needed - Windows/Wine loads d3d11.dll automatically from game folder.
 */
export async function launchGameWithXXMI(
  executablePath: string,
  _gameDirectory: string,
  runnerPath: string,
  winePrefix: string
): Promise<{ success: boolean; error?: string }> {
  const importer = getXXMIImporter(executablePath)

  if (!importer) {
    return { success: false, error: 'No XXMI importer found for this game' }
  }

  // Check if XXMI is installed
  if (!isXXMIInstalled()) {
    console.log('[xxmi] XXMI not found, downloading...')
    const result = await downloadXXMI((percent) => {
      console.log(`[xxmi] Download: ${percent}%`)
    })
    if (!result.success) {
      return result
    }
  }

  // Check if runner is installed
  const runner = findInstalledRunner()
  if (!runner) {
    return {
      success: false,
      error: 'No Proton runner found. Please install a runner first.'
    }
  }

  const gameFolder = path.dirname(executablePath)

  // Configure XXMI config
  configureImporterGameFolder(importer, gameFolder)
  ensureLinuxCompatibility(importer)

  // NOTE: For anti-cheat games (EFMI), XXMI uses Inject mode which injects from
  // the EFMI folder - we should NOT deploy to game folder to avoid conflicts.
  // For non-anti-cheat games, Hook mode would deploy to game folder.
  // Currently we rely on XXMI Launcher to handle everything via --nogui.
  console.log(`[xxmi] Using XXMI Launcher inject mode for ${importer}`)

  // Kill any existing zombie processes before launching
  console.log(`[xxmi] Cleaning up any existing game processes...`)
  try {
    execSync('pkill -9 -f "Endfield" 2>/dev/null || true')
    execSync('pkill -9 -f "umu-run" 2>/dev/null || true')
  } catch {
    // Ignore errors
  }

  return new Promise((resolve) => {
    const { launcherExe } = getXXMIPaths()

    console.log(`[xxmi] Launching ${path.basename(executablePath)} with ${importer} via XXMI Launcher`)

    // Environment for Proton - use the GAME's prefix
    const env = {
      ...process.env,
      WINEPREFIX: winePrefix,
      WINEARCH: 'win64',
      // Disable Wayland for compatibility
      DISABLE_WAYLAND: '1',
      GDK_BACKEND: 'x11',
      QT_QPA_PLATFORM: 'xcb',
      // DXVK settings
      DXVK_STATE_CACHE_PATH: winePrefix,
      // Force native d3d11.dll (3DMigoto)
      WINEDLLOVERRIDES: 'd3d11=n,b;dxgi=n,b',
    }

    console.log(`[xxmi] Wine: ${runner.wine}`)
    console.log(`[xxmi] XXMI: ${launcherExe}`)
    console.log(`[xxmi] Prefix: ${winePrefix}`)

    // Run XXMI Launcher with --nogui --xxmi IMPORTER
    // XXMI will inject the DLL into the game process
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

    // Give XXMI time to start and launch the game
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
// Mod Management Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the Mods folder path for an importer
 */
export function getModsPath(importer: string): string {
  const { xxmiDir } = getXXMIPaths()
  return path.join(xxmiDir, importer, 'Mods')
}

/**
 * Get all mods for an importer
 * Scans the Mods folder and returns a list of mods with their enabled state
 */
export function getMods(importer: string): Mod[] {
  const modsPath = getModsPath(importer)

  if (!fs.existsSync(modsPath)) {
    console.log(`[mods] Mods folder not found: ${modsPath}`)
    return []
  }

  const entries = fs.readdirSync(modsPath, { withFileTypes: true })

  // Filter to only directories, exclude special folders
  const excludeFolders = ['ShaderCache', 'ShaderFixes', 'Core']

  return entries
    .filter(e => e.isDirectory() && !excludeFolders.includes(e.name))
    .map(e => {
      const isDisabled = e.name.startsWith('DISABLED_')
      const cleanName = isDisabled ? e.name.substring(9) : e.name

      return {
        name: cleanName,
        folder: e.name,
        enabled: !isDisabled,
        path: path.join(modsPath, e.name),
      }
    })
}

/**
 * Toggle a mod on/off by renaming the folder
 * Enabled: modname/
 * Disabled: DISABLED_modname/
 */
export function toggleMod(modPath: string, enabled: boolean): boolean {
  const dir = path.dirname(modPath)
  const folder = path.basename(modPath)
  const isCurrentlyDisabled = folder.startsWith('DISABLED_')

  try {
    if (enabled && isCurrentlyDisabled) {
      // Disabled → Enabled: remove DISABLED_ prefix
      const newName = folder.substring(9)
      const newPath = path.join(dir, newName)
      fs.renameSync(modPath, newPath)
      console.log(`[mods] Enabled mod: ${newName}`)
      return true
    } else if (!enabled && !isCurrentlyDisabled) {
      // Enabled → Disabled: add DISABLED_ prefix
      const newName = 'DISABLED_' + folder
      const newPath = path.join(dir, newName)
      fs.renameSync(modPath, newPath)
      console.log(`[mods] Disabled mod: ${folder}`)
      return true
    }
    // Already in desired state
    return true
  } catch (err) {
    console.error(`[mods] Failed to toggle mod:`, err)
    return false
  }
}

/**
 * Install a mod from a zip file
 * Extracts the zip to the Mods folder
 */
export async function installMod(importer: string, zipPath: string): Promise<{ success: boolean; error?: string }> {
  const modsPath = getModsPath(importer)

  // Ensure Mods folder exists
  if (!fs.existsSync(modsPath)) {
    fs.mkdirSync(modsPath, { recursive: true })
  }

  // Get mod name from zip filename
  const modName = path.basename(zipPath, path.extname(zipPath))
  const destPath = path.join(modsPath, modName)

  // Check if already exists
  if (fs.existsSync(destPath) || fs.existsSync(path.join(modsPath, 'DISABLED_' + modName))) {
    return { success: false, error: 'Mod already exists' }
  }

  return new Promise((resolve) => {
    console.log(`[mods] Extracting ${zipPath} to ${destPath}`)

    const extract = spawn('unzip', ['-o', zipPath, '-d', destPath], {
      stdio: 'inherit'
    })

    extract.on('close', (code) => {
      if (code === 0) {
        console.log(`[mods] Installed mod: ${modName}`)
        resolve({ success: true })
      } else {
        console.error(`[mods] Extraction failed with code:`, code)
        resolve({ success: false, error: `Failed to extract mod (exit code ${code})` })
      }
    })

    extract.on('error', (err) => {
      console.error(`[mods] Extraction error:`, err)
      resolve({ success: false, error: `Extraction failed: ${err.message}` })
    })
  })
}

/**
 * Delete a mod folder
 */
export function deleteMod(modPath: string): boolean {
  try {
    fs.rmSync(modPath, { recursive: true, force: true })
    console.log(`[mods] Deleted mod: ${path.basename(modPath)}`)
    return true
  } catch (err) {
    console.error(`[mods] Failed to delete mod:`, err)
    return false
  }
}

/**
 * Enable all mods for an importer
 */
export function enableAllMods(importer: string): void {
  const mods = getMods(importer)
  for (const mod of mods) {
    if (!mod.enabled) {
      toggleMod(mod.path, true)
    }
  }
}

/**
 * Disable all mods for an importer
 */
export function disableAllMods(importer: string): void {
  const mods = getMods(importer)
  for (const mod of mods) {
    if (mod.enabled) {
      toggleMod(mod.path, false)
    }
  }
}
