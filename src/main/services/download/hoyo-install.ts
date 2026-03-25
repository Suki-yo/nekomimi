import * as fs from 'fs'
import * as path from 'path'
import type { HoyoGameBiz } from '../../../shared/types/download'

function readTextIfExists(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null
  }

  return fs.readFileSync(filePath, 'utf-8')
}

function firstMatchingVersion(
  contents: string | null,
  patterns: RegExp[],
): string | null {
  if (!contents) {
    return null
  }

  for (const pattern of patterns) {
    const match = contents.match(pattern)
    if (match?.[1]) {
      return match[1]
    }
  }

  return null
}

function detectGenshinVersion(installDir: string): string | null {
  const scriptVersion = readTextIfExists(
    path.join(installDir, 'GenshinImpact_Data', 'Persistent', 'ScriptVersion')
  )

  if (!scriptVersion) {
    return null
  }

  const match = scriptVersion.trim().match(/(\d+\.\d+\.\d+)/)
  return match ? match[1] : null
}

function detectStarRailVersion(installDir: string): string | null {
  const directVersionPatterns = [
    /OSPRODWin(\d+\.\d+\.\d+)/,
    /\b(\d+\.\d+\.\d+)\b/,
  ]
  const installVersionPatterns = [
    /,(\d+\.\d+)\.\d+/,
    /\b(\d+\.\d+\.\d+)\b/,
  ]

  const directVersionFiles = [
    path.join(installDir, 'version_info'),
    path.join(installDir, 'StarRail_Data', 'StreamingAssets', 'BinaryVersion.bytes'),
    path.join(installDir, 'StarRail_Data', 'Persistent', 'BinaryVersion.bytes'),
  ]

  for (const filePath of directVersionFiles) {
    const version = firstMatchingVersion(readTextIfExists(filePath), directVersionPatterns)
    if (version) {
      return version
    }
  }

  const installVersionFiles = [
    path.join(installDir, 'StarRail_Data', 'Persistent', 'InstallVersion.bin'),
    path.join(installDir, 'InstallVersion.bin'),
  ]

  for (const filePath of installVersionFiles) {
    const version = firstMatchingVersion(readTextIfExists(filePath), installVersionPatterns)
    if (version) {
      return version.includes('.') && version.split('.').length === 2 ? `${version}.0` : version
    }
  }

  return null
}

function detectZzzVersion(installDir: string): string | null {
  const versionInfo = readTextIfExists(path.join(installDir, 'version_info'))

  if (!versionInfo) {
    return null
  }

  const match = versionInfo.trim().match(/OSPRODWin(\d+\.\d+\.\d+)/)
  return match ? match[1] : null
}

export async function detectHoyoInstalledVersion(
  installDir: string,
  biz: HoyoGameBiz
): Promise<string | null> {
  switch (biz) {
    case 'genshin':
      return detectGenshinVersion(installDir)
    case 'starrail':
      return detectStarRailVersion(installDir)
    case 'zzz':
      return detectZzzVersion(installDir)
    default:
      return null
  }
}
