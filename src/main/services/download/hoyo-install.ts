import * as fs from 'fs'
import * as path from 'path'
import type { HoyoGameBiz } from '../../../shared/types/download'

function readTextIfExists(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null
  }

  return fs.readFileSync(filePath, 'utf-8')
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
  const binaryVersion = readTextIfExists(
    path.join(installDir, 'StarRail_Data', 'StreamingAssets', 'BinaryVersion.bytes')
  )

  if (binaryVersion) {
    const binaryMatch = binaryVersion.match(/OSPRODWin(\d+\.\d+\.\d+)/)
    if (binaryMatch) {
      return binaryMatch[1]
    }
  }

  const installVersion = readTextIfExists(
    path.join(installDir, 'StarRail_Data', 'Persistent', 'InstallVersion.bin')
  )

  if (!installVersion) {
    return null
  }

  const installMatch = installVersion.match(/,(\d+\.\d+)\.\d+/)
  return installMatch ? `${installMatch[1]}.0` : null
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
