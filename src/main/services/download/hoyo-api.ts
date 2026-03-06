// HoYoverse official API client
// Fetches game version info from launcher APIs

import * as https from 'https'
import type { ClientRequest } from 'http'
import type { HoyoGameBiz, HoyoVersionInfo, DiffPatch } from '../../../shared/types/download'
import { fetchTwintailManifest, twintailToHoyoVersionInfo } from './twintail-api'

// HoYoPlay (HYP) unified launcher API
const HYP_API_BASE = 'https://sg-hyp-api.hoyoverse.com/hyp/hyp-connect/api/getGamePackages'
const HYP_LAUNCHER_ID = 'VYTpXlbWo8'

const HYP_GAME_IDS: Record<HoyoGameBiz, string> = {
  genshin: 'gopR6Cufr3',
  starrail: '4ziysqXOQ8',
  zzz: 'U5hbdsT9W7',
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

// HYP API response structure
interface HypGamePkg {
  url: string
  md5: string
  size: string
  decompressed_size: string
}

interface HypAudioPkg {
  language: string
  url: string
  md5: string
  size: string
  decompressed_size: string
}

interface HypAPIResponse {
  retcode: number
  message: string
  data: {
    game_packages: Array<{
      game: {
        id: string
        biz: string
      }
      main: {
        major: {
          version: string
          game_pkgs: HypGamePkg[]
          audio_pkgs: HypAudioPkg[]
          res_list_url?: string
        }
        patches: Array<{
          version: string
          game_pkgs: HypGamePkg[]
          audio_pkgs: HypAudioPkg[]
        }>
      }
    }>
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

// Fetch game version info from HYP API (fallback when Twintail unavailable)
async function fetchGameResourceFromOfficialAPI(biz: HoyoGameBiz): Promise<HoyoVersionInfo | null> {
  const gameId = HYP_GAME_IDS[biz]
  const url = `${HYP_API_BASE}?launcher_id=${HYP_LAUNCHER_ID}&game_ids[]=${gameId}`

  try {
    console.log(`[hoyo-api] Fetching ${biz} from HYP API...`)
    const response = await fetchJSONWithRetry<HypAPIResponse>(url)

    if (response.retcode !== 0) {
      console.error(`[hoyo-api] HYP API error for ${biz}: retcode=${response.retcode}, message="${response.message}"`)
      return null
    }

    const pkg = response.data?.game_packages?.find((p) => p.game.id === gameId)
    if (!pkg) {
      console.error(`[hoyo-api] No package found for game_id=${gameId} (${biz})`)
      return null
    }

    const major = pkg.main.major
    if (!major.game_pkgs || major.game_pkgs.length === 0) {
      console.error(`[hoyo-api] No game packages in HYP response for ${biz}`)
      return null
    }

    const diffs: DiffPatch[] = pkg.main.patches.map((patch) => ({
      version: patch.version,
      path: patch.game_pkgs[0]?.url ?? '',
      md5: patch.game_pkgs[0]?.md5 ?? '',
      size: patch.game_pkgs[0]?.size ?? '0',
      voicePacks: [],
    }))

    const info: HoyoVersionInfo = {
      version: major.version,
      downloadMode: 'zip',
      segments: major.game_pkgs.map((pkg) => ({
        url: pkg.url,
        md5: pkg.md5,
        size: parseInt(pkg.size, 10) || 0,
      })),
      voicePacks: [],
      diffs,
    }

    console.log(`[hoyo-api] ${biz} version: ${info.version}, segments: ${info.segments?.length}`)
    return info
  } catch (err) {
    if (err instanceof HoyoApiError) {
      console.error(`[hoyo-api] Failed to fetch ${biz}: ${err.message}`)
      if (err.statusCode) console.error(`[hoyo-api] HTTP Status: ${err.statusCode}`)
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
