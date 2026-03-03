// HoYoverse official API client
// Fetches game version info from launcher APIs

import * as https from 'https'
import type { HoyoGameBiz, HoyoVersionInfo, DownloadMode, VoicePack, DiffPatch } from '../../../shared/types/download'

// Official HoYoverse launcher API endpoints
const HOYO_API_ENDPOINTS: Record<HoyoGameBiz, string> = {
  genshin: 'https://sdk-os-static.mihoyo.com/hk4e_global/mdk/launcher/api/resource?key=gcStgarh&launcher_id=10&channel_id=1',
  starrail: 'https://api-os-takumi.hoyoverse.com/common/hkrpg_global/launcher/api/resource?key=6KcVuS3DLdY4Q23j&launcher_id=33&sub_channel_id=1',
  zzz: 'https://sdk-os-static.hoyoverse.com/nap_global/mdk/launcher/api/resource?key=9LbQej2KuoV34QXD&launcher_id=36&channel_id=1',
}

// Raw API response structure
interface HoyoAPIResponse {
  retcode: number
  message: string
  data: {
    game: {
      latest: {
        version: string
        path: string
        size: string
        md5: string
        segments?: Array<{
          path: string
          md5: string
          package_size: string
        }>
        decompressed_path: string
        voice_packs: VoicePack[]
      }
      diffs: Array<{
        version: string
        path: string
        size: string
        md5: string
        voice_packs: VoicePack[]
      }>
    }
  }
}

// Fetch JSON from URL
function fetchJSON<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'application/json',
        },
      },
      (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            fetchJSON<T>(redirectUrl).then(resolve).catch(reject)
            return
          }
        }

        let data = ''
        response.on('data', (chunk) => (data += chunk))
        response.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (err) {
            reject(new Error(`Failed to parse JSON: ${err}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

// Determine download mode from resource info
function getDownloadMode(latest: HoyoAPIResponse['data']['game']['latest']): DownloadMode {
  // If decompressed_path exists and looks like a Sophon manifest URL, use sophon mode
  const decompressedPath = latest.decompressed_path
  if (decompressedPath && decompressedPath.includes('chunk')) {
    return 'sophon'
  }
  return 'zip'
}

// Parse size string to bytes (e.g., "102400" or "100 MB")
function parseSizeToBytes(sizeStr: string): number {
  const num = parseInt(sizeStr, 10)
  if (isNaN(num)) return 0
  // API returns size in some unit, typically bytes or needs conversion
  // For now, assume it's bytes
  return num
}

// Fetch game version info from official API
export async function fetchGameResource(biz: HoyoGameBiz): Promise<HoyoVersionInfo | null> {
  const url = HOYO_API_ENDPOINTS[biz]
  if (!url) {
    console.error(`[hoyo-api] Unknown game biz: ${biz}`)
    return null
  }

  try {
    console.log(`[hoyo-api] Fetching ${biz} resource info...`)
    const response = await fetchJSON<HoyoAPIResponse>(url)

    if (response.retcode !== 0) {
      console.error(`[hoyo-api] API error: ${response.message}`)
      return null
    }

    const latest = response.data.game.latest
    const downloadMode = getDownloadMode(latest)

    const info: HoyoVersionInfo = {
      version: latest.version,
      downloadMode,
      zipUrl: latest.path,
      zipMd5: latest.md5,
      zipSize: parseSizeToBytes(latest.size),
      voicePacks: latest.voice_packs || [],
      diffs: [], // Will be set below
    }

    // Handle segmented downloads (large files split into parts)
    if (latest.segments && latest.segments.length > 0) {
      info.segments = latest.segments.map((seg) => ({
        url: seg.path,
        md5: seg.md5,
        size: parseSizeToBytes(seg.package_size),
      }))
    }

    // Sophon manifest URL (for chunk-based downloads)
    if (downloadMode === 'sophon' && latest.decompressed_path) {
      info.sophonManifestUrl = latest.decompressed_path
    }

    // Convert API snake_case to camelCase for diffs
    info.diffs = response.data.game.diffs.map((diff) => ({
      version: diff.version,
      path: diff.path,
      md5: diff.md5,
      size: diff.size,
      voicePacks: diff.voice_packs || [],
    }))

    console.log(`[hoyo-api] ${biz} version: ${info.version}, mode: ${info.downloadMode}`)
    return info
  } catch (err) {
    console.error(`[hoyo-api] Failed to fetch ${biz} resource:`, err)
    return null
  }
}

// Get available diff patches for updating from current version
export function getDiffPatches(
  resource: HoyoVersionInfo,
  currentVersion: string
): DiffPatch[] {
  return resource.diffs.filter((diff) => diff.version === currentVersion)
}

// Check if update is available
export function isUpdateAvailable(
  currentVersion: string | undefined,
  latestVersion: string
): boolean {
  if (!currentVersion) return true
  return currentVersion !== latestVersion
}
