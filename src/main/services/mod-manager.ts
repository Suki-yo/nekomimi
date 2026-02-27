import { spawn } from 'child_process'
import * as path from 'path'

// Hardcoded paths for now - will be configurable later
const TWINTAIL_XXMI_PATH = '/home/jyq/.local/share/twintaillauncher/extras/xxmi'

// Map game executables to XXMI package names (lowercase to match folder names)
const GAME_TO_PACKAGE: Record<string, string> = {
  'endfield.exe': 'efmi',
  'genshinimpact.exe': 'gimi',
  'starrail.exe': 'srmi',
  'zenlesszonezero.exe': 'zzmi',
  'bh3.exe': 'himi',
  'client-win64-shipping.exe': 'wwmi', // Wuthering Waves
}

/**
 * Detect which XXMI package to use based on game executable name
 */
export function getXXMIPackage(executablePath: string): string | null {
  const exeName = path.basename(executablePath).toLowerCase()
  return GAME_TO_PACKAGE[exeName] || null
}

/**
 * Check if a game should use XXMI (hardcoded for Endfield for now)
 */
export function shouldUseXXMI(executablePath: string): boolean {
  const exeName = path.basename(executablePath).toLowerCase()
  // Hardcoded: only Endfield for now
  return exeName === 'endfield.exe'
}

/**
 * Start 3dmloader using the Twintail approach
 *
 * Key requirements:
 * 1. Run 3dmloader from inside the game's xxmi folder (efmi/, gimi/, etc.)
 * 2. Use WINEDLLOVERRIDES="d3d11=n" to force native 3DMigoto DLL
 * 3. Use the game's Proton wine64 binary
 */
export async function startXXMILoader(
  packageName: string,
  runnerPath: string,
  winePrefix: string
): Promise<{ success: boolean; pid?: number; error?: string }> {
  return new Promise((resolve) => {
    console.log(`[xxmi] Starting 3dmloader for ${packageName}`)

    // Path to the game's xxmi folder (efmi/, gimi/, etc.)
    const packagePath = path.join(TWINTAIL_XXMI_PATH, packageName)
    const wine64 = path.join(runnerPath, 'files/bin/wine64')

    // Build command: run 3dmloader from inside the package folder
    const command = `"${wine64}" "3dmloader.exe"`

    // Set up Proton environment with DLL override for 3DMigoto
    const env = {
      ...process.env,
      WINEARCH: 'win64',
      WINEPREFIX: winePrefix,
      STEAM_COMPAT_APP_ID: '0',
      STEAM_COMPAT_DATA_PATH: winePrefix.replace('/pfx', ''),
      STEAM_COMPAT_CLIENT_INSTALL_PATH: '',
      STEAM_COMPAT_TOOL_PATHS: runnerPath,
      PROTONFIXES_DISABLE: '1',
      // Force native d3d11.dll (3DMigoto) instead of Wine's
      WINEDLLOVERRIDES: 'd3d11=n;lsteamclient=d;KRSDKExternal.exe=d',
    }

    console.log(`[xxmi] Command: ${command}`)
    console.log(`[xxmi] Working dir: ${packagePath}`)
    console.log(`[xxmi] WINEPREFIX: ${winePrefix}`)

    const proc = spawn('bash', ['-c', command], {
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: packagePath, // Run from inside the package folder!
    })

    // Capture output for debugging
    proc.stdout?.on('data', (data) => {
      console.log(`[xxmi] ${data.toString().trim()}`)
    })
    proc.stderr?.on('data', (data) => {
      console.log(`[xxmi err] ${data.toString().trim()}`)
    })

    proc.on('error', (err) => {
      console.error(`[xxmi] Failed to start 3dmloader:`, err)
      resolve({ success: false, error: `Failed to start 3dmloader: ${err.message}` })
    })

    // Give loader time to initialize
    setTimeout(() => {
      if (proc.pid) {
        console.log(`[xxmi] 3dmloader started with PID ${proc.pid}`)
        resolve({ success: true, pid: proc.pid })
      } else {
        resolve({ success: false, error: '3dmloader failed to start' })
      }
    }, 2000)

    proc.on('close', (code) => {
      console.log(`[xxmi] 3dmloader exited with code ${code}`)
    })
  })
}

/**
 * Launch game with XXMI injection
 * Uses Twintail's approach: start loader with Proton, then launch game
 */
export async function launchGameWithXXMI(
  executablePath: string,
  runnerPath: string,
  winePrefix: string
): Promise<{ success: boolean; error?: string }> {
  const packageName = getXXMIPackage(executablePath)

  if (!packageName) {
    return { success: false, error: 'No XXMI package found for this game' }
  }

  console.log(`[xxmi] Using package: ${packageName}`)

  // Start the loader - it will wait for game process
  const loaderResult = await startXXMILoader(packageName, runnerPath, winePrefix)

  if (!loaderResult.success) {
    return { success: false, error: loaderResult.error }
  }

  // Return success - caller should launch the game normally
  console.log(`[xxmi] Loader running, proceeding with game launch`)
  return { success: true }
}
