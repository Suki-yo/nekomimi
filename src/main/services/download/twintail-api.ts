// Twintail Launcher manifest client
// Fetches game version info from Twintail's manifest repository

import * as https from 'https'
import type { ClientRequest } from 'http'
import type { HoyoGameBiz, HoyoVersionInfo } from '../../../shared/types/download'
import { USER_AGENT } from './utils'

// Twintail manifest URLs from GitHub
const TWINTAIL_MANIFEST_URLS: Record<HoyoGameBiz, string> = {
  genshin: 'https://raw.githubusercontent.com/TwintailTeam/game-manifests/main/hk4e_global.json',
  starrail: 'https://raw.githubusercontent.com/TwintailTeam/game-manifests/main/hkrpg_global.json',
  zzz: 'https://raw.githubusercontent.com/TwintailTeam/game-manifests/main/nap_global.json',
}

// Configuration
const REQUEST_TIMEOUT_MS = 15000 // 15 seconds

// Twintail manifest response structure
interface TwintailGameVersion {
  metadata: {
    versioned_name: string
    version: string
    download_mode: string
    game_hash: string
    index_file: string    // Sophon manifest URL (zstd-compressed protobuf)
    res_list_url: string  // Chunk base URL
    game_biz?: string
  }
  game: {
    full: Array<{
      file_url: string          // Direct zip/7z download URL
      compressed_size: string
      decompressed_size: string
      file_hash: string
      file_path?: string
      region_code?: string
    }>
    diffs?: Array<{
      version: string
      file_url: string
      file_path: string
    }>
  }
}

interface TwintailManifest {
  version: number
  display_name: string
  biz: string
  latest_version: string
  game_versions: TwintailGameVersion[]
}

// Custom error class for API errors
class TwintailApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly responseBody?: string
  ) {
    super(message)
    this.name = 'TwintailApiError'
  }
}

// Fetch JSON from URL with timeout
async function fetchJSON<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const req = ongoingRequest
      if (req) {
        req.destroy()
      }
      reject(new TwintailApiError(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`))
    }, REQUEST_TIMEOUT_MS)

    let ongoingRequest: ClientRequest | null = null

    ongoingRequest = https.get(
      url,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json, text/plain, */*',
        },
      },
      (response) => {
        clearTimeout(timeoutId)

        // Check for HTTP errors
        if (response.statusCode && response.statusCode >= 400) {
          let errorBody = ''
          response.on('data', (chunk) => (errorBody += chunk))
          response.on('end', () => {
            reject(
              new TwintailApiError(
                `HTTP ${response.statusCode}: ${response.statusMessage}`,
                response.statusCode,
                errorBody.substring(0, 500)
              )
            )
          })
          return
        }

        let data = ''
        response.on('data', (chunk) => (data += chunk))
        response.on('end', () => {
          try {
            // Check if response looks like HTML (error page)
            const trimmedData = data.trim()
            if (trimmedData.startsWith('<!') || trimmedData.startsWith('<html')) {
              reject(new TwintailApiError('Received HTML instead of JSON', response.statusCode))
              return
            }

            const parsed = JSON.parse(data)
            resolve(parsed)
          } catch (err) {
            reject(new TwintailApiError(`Failed to parse JSON: ${err}`))
          }
        })
      }
    )

    ongoingRequest.on('error', (err: Error) => {
      clearTimeout(timeoutId)
      reject(new TwintailApiError(`Network error: ${err.message}`))
    })

    ongoingRequest.end()
  })
}

// Fetch Twintail manifest for a game
export async function fetchTwintailManifest(biz: HoyoGameBiz): Promise<TwintailManifest | null> {
  const url = TWINTAIL_MANIFEST_URLS[biz]
  if (!url) {
    console.error(`[twintail] Unknown game biz: ${biz}`)
    return null
  }

  try {
    console.log(`[twintail] Fetching ${biz} manifest from ${url}`)
    const manifest = await fetchJSON<TwintailManifest>(url)

    if (!manifest.game_versions || manifest.game_versions.length === 0) {
      console.error(`[twintail] No game versions found in manifest for ${biz}`)
      return null
    }

    console.log(`[twintail] Found ${manifest.game_versions.length} versions for ${biz}`)
    return manifest
  } catch (err) {
    if (err instanceof TwintailApiError) {
      console.error(`[twintail] Failed to fetch ${biz}: ${err.message}`)
    } else {
      console.error(`[twintail] Failed to fetch ${biz} manifest:`, err)
    }
    return null
  }
}

// Convert Twintail manifest to HoyoVersionInfo
export function twintailToHoyoVersionInfo(
  twintail: TwintailManifest,
  preferVersion?: string
): HoyoVersionInfo | null {
  // Find the requested version or use the latest
  let gameVersion: TwintailGameVersion | undefined

  if (preferVersion) {
    gameVersion = twintail.game_versions.find((v) => v.metadata.version === preferVersion)
    if (!gameVersion) {
      console.warn(`[twintail] Version ${preferVersion} not found, using latest`)
    }
  }

  if (!gameVersion) {
    // Use latest (first in array is typically latest)
    gameVersion = twintail.game_versions[0]
  }

  if (!gameVersion) {
    console.error('[twintail] No valid game version found')
    return null
  }

  const metadata = gameVersion.metadata

  // Check if full array exists and has at least one element
  if (!gameVersion.game.full || gameVersion.game.full.length === 0) {
    console.error('[twintail] No full package found in game version')
    return null
  }

  const fullPackage = gameVersion.game.full[0]

  // Determine download mode from metadata
  const downloadMode = metadata.download_mode === 'DOWNLOAD_MODE_CHUNK' ? 'sophon' : 'zip'

  // Validate Sophon URLs — file_url = manifest, file_path = chunk base
  if (downloadMode === 'sophon') {
    try {
      new URL(fullPackage.file_url)
    } catch {
      console.error(`[twintail] Invalid Sophon manifest URL (file_url): ${fullPackage.file_url}`)
      return null
    }
    try {
      new URL(fullPackage.file_path ?? '')
    } catch {
      console.error(`[twintail] Invalid chunk base URL (file_path): ${fullPackage.file_path}`)
      return null
    }
  }

  // Collect all valid Sophon manifests from game.full (games like ZZZ have multiple)
  const sophonManifests: Array<{ manifestUrl: string; chunkBaseUrl: string }> = []
  if (downloadMode === 'sophon') {
    for (const pkg of gameVersion.game.full) {
      try {
        new URL(pkg.file_url)
        new URL(pkg.file_path ?? '')
        sophonManifests.push({ manifestUrl: pkg.file_url, chunkBaseUrl: pkg.file_path! })
      } catch {
        // Skip entries with invalid URLs
      }
    }
    console.log(`[twintail] Found ${sophonManifests.length} Sophon manifests for ${metadata.version}`)
  }

  const info: HoyoVersionInfo = {
    version: metadata.version,
    downloadMode,
    sophonManifestUrl: fullPackage.file_url,
    sophonChunkBaseUrl: fullPackage.file_path ?? metadata.res_list_url,
    sophonManifests: sophonManifests.length > 1 ? sophonManifests : undefined,
    zipUrl: downloadMode === 'zip' ? fullPackage.file_url : undefined,
    voicePacks: [],
    diffs: [],
  }

  console.log(`[twintail] Converted ${metadata.version} (${downloadMode} mode)`)
  console.log(`[twintail] Sophon manifest URL: ${info.sophonManifestUrl}`)
  console.log(`[twintail] Chunk base URL: ${info.sophonChunkBaseUrl}`)

  return info
}

// Get available versions from Twintail manifest
export function getTwintailVersions(twintail: TwintailManifest): string[] {
  return twintail.game_versions.map((v) => v.metadata.version)
}
