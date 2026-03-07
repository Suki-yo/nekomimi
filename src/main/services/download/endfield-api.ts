// Arknights: Endfield official launcher API client (OS/Global server)
// API: launcher.gryphline.com/api

import * as https from 'https'
import type { ClientRequest } from 'http'
import type { HoyoVersionInfo } from '../../../shared/types/download'

const ENDFIELD_API_BASE = 'https://launcher.gryphline.com/api'
const ENDFIELD_GAME_APP_CODE = 'YDUTE5gscDZ229CW'
const ENDFIELD_LAUNCHER_APP_CODE = 'TiaytKBUIEdoEwRT'
const ENDFIELD_CHANNEL = 6
const ENDFIELD_SUB_CHANNEL = 6

const REQUEST_TIMEOUT_MS = 15000

interface EndfieldPack {
  url: string
  md5: string
  package_size: string
}

interface EndfieldGameResponse {
  action: number
  version: string
  request_version: string
  pkg: {
    packs: EndfieldPack[]
    total_size: string
    file_path: string
    url: string
    md5: string
    package_size: string
    game_files_md5: string
  }
  patch: null | {
    url: string
    md5: string
    package_size: string
    total_size: string
    patches: EndfieldPack[]
  }
  state: number
  launcher_action: number
}

function fetchJSON<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    let ongoingRequest: ClientRequest | null = null

    const timeoutId = setTimeout(() => {
      ongoingRequest?.destroy()
      reject(new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`))
    }, REQUEST_TIMEOUT_MS)

    ongoingRequest = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json, */*',
        },
      },
      (response) => {
        clearTimeout(timeoutId)

        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`))
          return
        }

        let data = ''
        response.on('data', (chunk) => (data += chunk))
        response.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch {
            reject(new Error(`Failed to parse JSON: ${data.substring(0, 100)}`))
          }
        })
        response.on('error', reject)
      }
    )

    ongoingRequest.on('error', (err) => {
      clearTimeout(timeoutId)
      reject(err)
    })

    ongoingRequest.end()
  })
}

// Fetch Endfield game version info (for Explore tab display)
export async function fetchEndfieldVersionInfo(): Promise<{ version: string; totalSize: number } | null> {
  const url =
    `${ENDFIELD_API_BASE}/game/get_latest` +
    `?appcode=${ENDFIELD_GAME_APP_CODE}` +
    `&launcher_appcode=${ENDFIELD_LAUNCHER_APP_CODE}` +
    `&channel=${ENDFIELD_CHANNEL}` +
    `&sub_channel=${ENDFIELD_SUB_CHANNEL}` +
    `&launcher_sub_channel=${ENDFIELD_SUB_CHANNEL}`

  try {
    console.log('[endfield-api] Fetching version info...')
    const rsp = await fetchJSON<EndfieldGameResponse>(url)
    return {
      version: rsp.version,
      totalSize: parseInt(rsp.pkg.total_size, 10) || 0,
    }
  } catch (err) {
    console.error('[endfield-api] Failed to fetch version info:', err)
    return null
  }
}

// Fetch Endfield game package info for download
export async function fetchEndfieldGame(): Promise<HoyoVersionInfo | null> {
  const url =
    `${ENDFIELD_API_BASE}/game/get_latest` +
    `?appcode=${ENDFIELD_GAME_APP_CODE}` +
    `&launcher_appcode=${ENDFIELD_LAUNCHER_APP_CODE}` +
    `&channel=${ENDFIELD_CHANNEL}` +
    `&sub_channel=${ENDFIELD_SUB_CHANNEL}` +
    `&launcher_sub_channel=${ENDFIELD_SUB_CHANNEL}`

  try {
    console.log('[endfield-api] Fetching game package info...')
    const rsp = await fetchJSON<EndfieldGameResponse>(url)

    const segments = rsp.pkg.packs.map((pack) => ({
      url: pack.url,
      md5: pack.md5,
      size: parseInt(pack.package_size, 10) || 0,
    }))

    const info: HoyoVersionInfo = {
      version: rsp.version,
      downloadMode: 'zip',
      segments,
      voicePacks: [],
      diffs: [],
    }

    console.log(`[endfield-api] version: ${info.version}, packs: ${segments.length}`)
    return info
  } catch (err) {
    console.error('[endfield-api] Failed to fetch game package info:', err)
    return null
  }
}
