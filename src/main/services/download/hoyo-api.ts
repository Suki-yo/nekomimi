// HoYoverse official API client
// Fetches game version info from launcher APIs

import * as https from 'https'
import type { ClientRequest } from 'http'
import type { HoyoGameBiz, HoyoVersionInfo, DownloadMode, VoicePack, DiffPatch } from '../../../shared/types/download'
import { fetchTwintailManifest, twintailToHoyoVersionInfo } from './twintail-api'

// Official HoYoverse launcher API endpoints
const HOYO_API_ENDPOINTS: Record<HoyoGameBiz, string> = {
  genshin: 'https://sdk-os-static.mihoyo.com/hk4e_global/mdk/launcher/api/resource?key=gcStgarh&launcher_id=10&channel_id=1',
  starrail: 'https://api-os-takumi.hoyoverse.com/common/hkrpg_global/launcher/api/resource?key=6KcVuS3DLdY4Q23j&launcher_id=33&sub_channel_id=1',
  zzz: 'https://sdk-os-static.hoyoverse.com/nap_global/mdk/launcher/api/resource?key=9LbQej2KuoV34QXD&launcher_id=36&channel_id=1',
}

// Configuration
const REQUEST_TIMEOUT_MS = 15000 // 15 seconds
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000 // Base delay for exponential backoff

// Options for fetching game resources
export interface FetchGameResourceOptions {
  useTwintail?: boolean // Default: true for Sophon downloads
  preferVersion?: string // Specific version from Twintail
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

// Custom error class for API errors
class HoyoApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly responseBody?: string,
    public readonly isRetryable: boolean = false
  ) {
    super(message)
    this.name = 'HoyoApiError'
  }
}

// Sleep utility for retry delays
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Fetch JSON from URL with timeout and content-type validation
async function fetchJSONWithRetry<T>(url: string, retries = MAX_RETRIES): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1) // Exponential backoff
      console.log(`[hoyo-api] Retry attempt ${attempt}/${retries} after ${delay}ms...`)
      await sleep(delay)
    }

    try {
      return await fetchJSON<T>(url)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      // Only retry on retryable errors
      if (err instanceof HoyoApiError && err.isRetryable && attempt < retries) {
        console.warn(`[hoyo-api] Attempt ${attempt + 1} failed: ${err.message}`)
        continue
      }

      throw err
    }
  }

  throw lastError
}

// Internal fetch without retry logic
function fetchJSON<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const req = ongoingRequest
      if (req) {
        req.destroy()
      }
      reject(new HoyoApiError(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`, undefined, undefined, true))
    }, REQUEST_TIMEOUT_MS)

    let ongoingRequest: ClientRequest | null = null

    ongoingRequest = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      },
      (response) => {
        clearTimeout(timeoutId)

        // Handle redirects - reject them to avoid timeout issues with redirected requests
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location
          reject(
            new HoyoApiError(
              `Unexpected redirect to: ${redirectUrl}. API endpoint may have changed.`,
              response.statusCode,
              undefined,
              false
            )
          )
          return
        }

        // Check for HTTP errors
        if (response.statusCode && response.statusCode >= 400) {
          const statusCode = response.statusCode
          let errorBody = ''
          response.on('data', (chunk) => (errorBody += chunk))
          response.on('end', () => {
            const isRetryable = statusCode === 429 || (statusCode >= 500 && statusCode < 600)
            reject(
              new HoyoApiError(
                `HTTP ${statusCode}: ${response.statusMessage}`,
                statusCode,
                errorBody.substring(0, 500),
                isRetryable
              )
            )
          })
          return
        }

        // Validate content-type before parsing
        const contentType = response.headers['content-type'] || ''
        let data = ''
        response.on('data', (chunk) => (data += chunk))
        response.on('end', () => {
          try {
            // Check if response looks like HTML (common when blocked by Cloudflare)
            const trimmedData = data.trim()
            if (trimmedData.startsWith('<!') || trimmedData.startsWith('<html')) {
              console.error(`[hoyo-api] Received HTML instead of JSON (possible WAF/Cloudflare block)`)
              console.error(`[hoyo-api] Response preview: ${trimmedData.substring(0, 200)}`)
              reject(
                new HoyoApiError(
                  'API returned HTML instead of JSON (possibly blocked by WAF/Cloudflare). Try again later.',
                  response.statusCode,
                  trimmedData.substring(0, 500),
                  true // Retryable - might be temporary
                )
              )
              return
            }

            // Validate content-type if present
            if (contentType && !contentType.includes('application/json') && !contentType.includes('text/plain')) {
              console.warn(`[hoyo-api] Unexpected content-type: ${contentType}`)
            }

            const parsed = JSON.parse(data)
            resolve(parsed)
          } catch (err) {
            // Log raw response for debugging
            console.error(`[hoyo-api] JSON parse failed`)
            console.error(`[hoyo-api] HTTP status: ${response.statusCode}`)
            console.error(`[hoyo-api] Content-Type: ${contentType}`)
            console.error(`[hoyo-api] Response (first 500 chars): ${data.substring(0, 500)}`)
            reject(
              new HoyoApiError(
                `Failed to parse JSON. Response starts with: "${data.substring(0, 50)}"`,
                response.statusCode,
                data.substring(0, 500),
                false
              )
            )
          }
        })
      }
    )

    ongoingRequest.on('error', (err: Error) => {
      clearTimeout(timeoutId)
      // Network errors are usually retryable
      reject(new HoyoApiError(`Network error: ${err.message}`, undefined, undefined, true))
    })

    ongoingRequest.end()
  })
}

// Determine download mode from resource info
function getDownloadMode(latest: HoyoAPIResponse['data']['game']['latest']): DownloadMode {
  // If decompressed_path exists and is non-empty, use sophon mode (chunk-based download)
  // decompressed_path is the Sophon manifest URL used for chunk-based downloads
  const decompressedPath = latest.decompressed_path
  if (decompressedPath && decompressedPath.length > 0) {
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

// Fetch game version info from official API (fallback)
async function fetchGameResourceFromOfficialAPI(biz: HoyoGameBiz): Promise<HoyoVersionInfo | null> {
  const url = HOYO_API_ENDPOINTS[biz]
  if (!url) {
    console.error(`[hoyo-api] Unknown game biz: ${biz}`)
    return null
  }

  try {
    console.log(`[hoyo-api] Fetching ${biz} resource info...`)
    const response = await fetchJSONWithRetry<HoyoAPIResponse>(url)

    if (response.retcode !== 0) {
      console.error(`[hoyo-api] API error for ${biz}: retcode=${response.retcode}, message="${response.message}"`)

      // Provide more helpful error messages based on common retcodes
      let errorMessage = response.message
      if (response.retcode === -10101) {
        errorMessage = 'API key may be invalid or expired'
      } else if (response.retcode === -10001 || response.retcode === -10002) {
        errorMessage = 'Server is busy, please try again later'
      }

      console.error(`[hoyo-api] ${biz}: ${errorMessage}`)
      return null
    }

    // Validate response structure
    if (!response.data?.game?.latest) {
      console.error(`[hoyo-api] Invalid response structure for ${biz}: missing data.game.latest`)
      return null
    }

    const latest = response.data.game.latest
    const downloadMode = getDownloadMode(latest)

    // Log what we got from API for debugging
    console.log(`[hoyo-api] ${biz} - path: "${latest.path}", decompressed_path: "${latest.decompressed_path}"`)

    // Validate download URLs exist
    if (!latest.path && !latest.decompressed_path) {
      console.error(`[hoyo-api] No download URLs in API response for ${biz}`)
      console.error(`[hoyo-api] path: "${latest.path}", decompressed_path: "${latest.decompressed_path}"`)
      return null
    }

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
    // The decompressed_path is a directory, we need to append the manifest filename
    if (downloadMode === 'sophon' && latest.decompressed_path) {
      // decompressed_path ends with directory like "ScatteredFiles"
      // Append manifest filename to get the full URL
      const baseUrl = latest.decompressed_path
      // Ensure trailing slash
      const manifestUrl = baseUrl.endsWith('/') ? `${baseUrl}manifest` : `${baseUrl}/manifest`
      info.sophonManifestUrl = manifestUrl
      // For official API, chunk base URL is the same as manifest directory
      info.sophonChunkBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
      console.log(`[hoyo-api] ${biz} - Sophon manifest URL: ${info.sophonManifestUrl}`)
      console.log(`[hoyo-api] ${biz} - Chunk base URL: ${info.sophonChunkBaseUrl}`)
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

    // Warn if zip mode but no zip URL (shouldn't happen but log for debugging)
    if (downloadMode === 'zip' && !latest.path) {
      console.warn(`[hoyo-api] ${biz} - zip mode detected but no zip URL available`)
    }

    return info
  } catch (err) {
    if (err instanceof HoyoApiError) {
      console.error(`[hoyo-api] Failed to fetch ${biz}: ${err.message}`)
      if (err.statusCode) {
        console.error(`[hoyo-api] HTTP Status: ${err.statusCode}`)
      }
      if (err.responseBody) {
        console.error(`[hoyo-api] Response preview: ${err.responseBody.substring(0, 200)}`)
      }
    } else {
      console.error(`[hoyo-api] Failed to fetch ${biz} resource:`, err)
    }
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

// Fetch game version info from Twintail or official API
export async function fetchGameResource(
  biz: HoyoGameBiz,
  options?: FetchGameResourceOptions
): Promise<HoyoVersionInfo | null> {
  const { useTwintail = true, preferVersion } = options || {}

  // Try Twintail first if enabled
  if (useTwintail) {
    console.log(`[hoyo-api] Using Twintail manifest for ${biz}`)
    const twintailManifest = await fetchTwintailManifest(biz)

    if (twintailManifest) {
      try {
        const versionInfo = twintailToHoyoVersionInfo(twintailManifest, preferVersion)
        if (versionInfo) {
          console.log(`[hoyo-api] ${biz} - Using Twintail manifest version: ${versionInfo.version}`)
          return versionInfo
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.warn(`[hoyo-api] Twintail conversion failed for ${biz}: ${errorMsg}`)
      }
    } else {
      console.warn(`[hoyo-api] Twintail fetch returned null for ${biz}`)
    }

    // Twintail failed, fall back to official API
    console.warn(`[hoyo-api] Twintail fetch failed for ${biz}, falling back to official API`)
  }

  // Use official API as fallback or if Twintail is disabled
  return fetchGameResourceFromOfficialAPI(biz)
}

// Check if update is available
export function isUpdateAvailable(
  currentVersion: string | undefined,
  latestVersion: string
): boolean {
  if (!currentVersion) return true
  return currentVersion !== latestVersion
}
