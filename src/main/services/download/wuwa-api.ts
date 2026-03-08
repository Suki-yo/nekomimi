// Wuthering Waves official launcher API client (OS/Global server)
// Index API: prod-alicdn-gamestarter.kurogame.com/launcher/game/G153/...

import * as https from 'https'
import * as zlib from 'zlib'
import type { ClientRequest, IncomingMessage } from 'http'
import type { WuwaVersionInfo, WuwaFileEntry } from '../../../shared/types/download'

// G153 = OS/Global server. The hash segment is tied to the launcher binary version
// and will need updating if Kuro ships a new launcher.
const WUWA_INDEX_URL =
  'https://prod-alicdn-gamestarter.kurogame.com/launcher/game/G153/50004_obOHXFrFanqsaIEOmuKroCcbZkQRBC7c/index.json'

const REQUEST_TIMEOUT_MS = 15000

// Shape of the index.json returned by Kuro's launcher API
interface WuwaIndexCdn {
  url: string
  P: number
}

interface WuwaIndexChannel {
  resources: string
  resourcesBasePath: string
  cdnList: WuwaIndexCdn[]
  version: string
  totalSize?: string | number
}

interface WuwaIndexResponse {
  default: WuwaIndexChannel
}

// Shape of each entry in resource.json
interface WuwaResourceEntry {
  dest: string
  md5: string
  size: number | string
}

// Shape of the resource.json manifest
interface WuwaResourceManifest {
  resource: WuwaResourceEntry[]
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
          'Accept-Encoding': 'gzip, deflate',
        },
      },
      (response: IncomingMessage) => {
        clearTimeout(timeoutId)

        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`))
          return
        }

        const encoding = response.headers['content-encoding']
        let stream: NodeJS.ReadableStream = response

        if (encoding === 'gzip') {
          stream = response.pipe(zlib.createGunzip())
        } else if (encoding === 'deflate') {
          stream = response.pipe(zlib.createInflate())
        }

        let data = ''
        stream.on('data', (chunk) => (data += chunk))
        stream.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch {
            reject(new Error(`Failed to parse JSON: ${data.substring(0, 100)}`))
          }
        })
        stream.on('error', reject)
      }
    )

    ongoingRequest.on('error', (err) => {
      clearTimeout(timeoutId)
      reject(err)
    })

    ongoingRequest.end()
  })
}

// Fetch the index.json and return WuwaVersionInfo with the best CDN pre-selected
export async function fetchWuwaVersionInfo(): Promise<WuwaVersionInfo | null> {
  try {
    console.log('[wuwa-api] Fetching index...')
    const index = await fetchJSON<WuwaIndexResponse>(WUWA_INDEX_URL)
    const channel = index.default
    if (!channel) {
      console.error('[wuwa-api] No "default" channel in index response')
      return null
    }

    // Select CDN with lowest P value (highest priority)
    const sorted = [...channel.cdnList].sort((a, b) => a.P - b.P)
    const bestCdn = sorted[0]
    if (!bestCdn) {
      console.error('[wuwa-api] No CDN entries in index response')
      return null
    }

    // Fetch resources.json to compute total size
    // channel.resources is already the full relative path to resource.json
    const manifestUrl = `${bestCdn.url}/${channel.resources}`
    console.log(`[wuwa-api] Fetching manifest from ${manifestUrl}`)
    const manifest = await fetchJSON<WuwaResourceManifest>(manifestUrl)
    const entries = manifest.resource

    const totalSize = entries.reduce((sum, e) => sum + (typeof e.size === 'string' ? parseInt(e.size, 10) : e.size), 0)

    return {
      version: channel.version,
      cdnUrl: bestCdn.url,
      resources: channel.resources,
      resourcesBasePath: channel.resourcesBasePath,
      totalSize,
    }
  } catch (err) {
    console.error('[wuwa-api] Failed to fetch version info:', err)
    return null
  }
}

// Fetch the full file manifest from the CDN
// resources is already the full relative path to resource.json
export async function fetchWuwaManifest(cdnUrl: string, resources: string): Promise<WuwaFileEntry[]> {
  const url = `${cdnUrl}/${resources}`
  const manifest = await fetchJSON<WuwaResourceManifest>(url)
  return manifest.resource.map((e) => ({
    dest: e.dest,
    md5: e.md5,
    size: typeof e.size === 'string' ? parseInt(e.size, 10) : e.size,
  }))
}
