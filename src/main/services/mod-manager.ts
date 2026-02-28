import { spawn } from 'child_process'
import * as path from 'path'

// Hardcoded XXMI paths - should be configurable later
const XXMI_PATH = '/home/jyq/Games/XXMI-Launcher'
const XXMI_PREFIX = '/home/jyq/Games/XXMI-Launcher/prefix'
const PROTON_PATH = '/home/jyq/.steam/steam/compatibilitytools.d/dwproton-10.0-14-x86_64-signed'

// Map game executables to XXMI importer names
const GAME_TO_XXMI_IMPORTER: Record<string, string> = {
  'endfield.exe': 'EFMI',
  // Add more games as needed:
  // 'genshinimpact.exe': 'GIMI',
  // 'starrail.exe': 'SRMI',
  // 'zenlesszonezero.exe': 'ZZMI',
}

/**
 * Check if a game should use XXMI
 */
export function shouldUseXXMI(executablePath: string): boolean {
  const exeName = path.basename(executablePath).toLowerCase()
  return exeName === 'endfield.exe'
}

/**
 * Get the XXMI importer name for a game
 */
export function getXXMIImporter(executablePath: string): string | null {
  const exeName = path.basename(executablePath).toLowerCase()
  return GAME_TO_XXMI_IMPORTER[exeName] || null
}

/**
 * Launch game with XXMI directly (no Lutris dependency)
 *
 * Uses the same environment that Lutris would set up:
 * - DXVK for D3D11 -> Vulkan translation
 * - Wayland disabled for compatibility
 * - Native d3d11.dll override for 3DMigoto injection
 */
export async function launchGameWithXXMI(
  executablePath: string,
  _runnerPath: string,
  _winePrefix: string
): Promise<{ success: boolean; error?: string }> {
  const importer = getXXMIImporter(executablePath)

  if (!importer) {
    return { success: false, error: 'No XXMI importer found for this game' }
  }

  return new Promise((resolve) => {
    console.log(`[xxmi] Launching with ${importer} (nogui mode)`)

    const wine64 = path.join(PROTON_PATH, 'files/bin/wine64')
    const xxmiExe = path.join(XXMI_PATH, 'Resources/Bin/XXMI Launcher.exe')

    // Environment matching Lutris configuration
    const env = {
      ...process.env,
      WINEPREFIX: XXMI_PREFIX,
      WINEARCH: 'win64',
      // Disable Wayland for compatibility
      DISABLE_WAYLAND: '1',
      GDK_BACKEND: 'x11',
      QT_QPA_PLATFORM: 'xcb',
      // DXVK settings
      DXVK_STATE_CACHE_PATH: XXMI_PREFIX,
      // Force native d3d11.dll (3DMigoto) and dxgi.dll
      WINEDLLOVERRIDES: 'd3d11=n,b;dxgi=n,b',
    }

    console.log(`[xxmi] Wine: ${wine64}`)
    console.log(`[xxmi] XXMI: ${xxmiExe}`)
    console.log(`[xxmi] Prefix: ${XXMI_PREFIX}`)

    // Run XXMI Launcher with --nogui --xxmi IMPORTER
    const proc = spawn(wine64, [xxmiExe, '--nogui', '--xxmi', importer], {
      env,
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(xxmiExe),
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
