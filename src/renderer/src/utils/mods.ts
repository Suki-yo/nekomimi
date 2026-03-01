// Utility functions for mod management

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
 * Get the XXMI importer name for a game executable
 */
export function getXXMIImporter(executablePath: string): string | null {
  const exeName = executablePath.split(/[/\\]/).pop()?.toLowerCase() || ''
  return GAME_TO_XXMI_IMPORTER[exeName] || null
}

/**
 * Check if a game supports XXMI mods
 */
export function gameSupportsMods(executablePath: string): boolean {
  return getXXMIImporter(executablePath) !== null
}
