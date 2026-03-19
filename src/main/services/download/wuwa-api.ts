// Wuthering Waves version manifest client
// Uses Twintail's maintained manifest instead of Kuro's launcher-version-specific index URL.

import * as https from 'https'
import * as fs from 'fs'
import * as path from 'path'
import * as zlib from 'zlib'
import type { ClientRequest, IncomingMessage } from 'http'
import type { WuwaVersionInfo, WuwaFileEntry, WuwaDiffInfo } from '../../../shared/types/download'
import { streamingMd5 } from './utils'

const WUWA_MANIFEST_URL =
  'https://raw.githubusercontent.com/TwintailTeam/game-manifests/main/wuwa_global.json'

const REQUEST_TIMEOUT_MS = 15000
const WUWA_VERSION_FILES = [
  'Client/Binaries/Win64/Client-Win64-Shipping.exe',
  'Wuthering Waves.exe',
]

let manifestCache: WuwaTwintailManifest | null = null
const indexCache = new Map<string, Promise<WuwaFileEntry[]>>()

interface WuwaTwintailVersionMetadata {
  version: string
  index_file: string
  res_list_url: string
}

interface WuwaTwintailDiffEntry {
  file_url: string
  file_hash: string
  compressed_size: string | number
  decompressed_size: string | number
  diff_type: string
  original_version: string
}

interface WuwaTwintailVersionEntry {
  metadata: WuwaTwintailVersionMetadata
  game?: {
    full?: Array<{
      compressed_size?: string | number
      decompressed_size?: string | number
    }>
    diff?: WuwaTwintailDiffEntry[]
  }
}

interface WuwaTwintailManifest {
  latest_version: string
  game_versions: WuwaTwintailVersionEntry[]
}

interface WuwaResourceEntry {
  dest: string
  md5: string
  size: number | string
}

interface WuwaResourceManifest {
  resource: WuwaResourceEntry[]
}

function toNumber(value: string | number | undefined): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return parseInt(value, 10) || 0
  return 0
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
          Accept: 'application/json, text/plain, */*',
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

async function fetchWuwaTwintailManifest(): Promise<WuwaTwintailManifest> {
  if (manifestCache) {
    return manifestCache
  }

  manifestCache = await fetchJSON<WuwaTwintailManifest>(WUWA_MANIFEST_URL)
  return manifestCache
}

function normalizeResListUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

function mapDiffs(entry: WuwaTwintailVersionEntry): WuwaDiffInfo[] {
  return (entry.game?.diff ?? [])
    .filter((diff) => diff.diff_type === 'krdiff')
    .map((diff) => ({
      originalVersion: diff.original_version,
      indexFileUrl: diff.file_url,
      resListUrl: normalizeResListUrl(diff.file_hash),
      downloadSize: toNumber(diff.compressed_size),
      installedSize: toNumber(diff.decompressed_size),
    }))
}

// Fetch current WuWa version info from Twintail's maintained manifest.
export async function fetchWuwaVersionInfo(): Promise<WuwaVersionInfo | null> {
  try {
    console.log('[wuwa-api] Fetching Twintail manifest...')
    const manifest = await fetchWuwaTwintailManifest()

    const latest = manifest.game_versions.find((entry) => entry.metadata.version === manifest.latest_version)
      ?? manifest.game_versions[0]

    if (!latest?.metadata?.index_file || !latest.metadata.res_list_url) {
      console.error('[wuwa-api] Latest manifest entry is missing download metadata')
      return null
    }

    const totalSize =
      toNumber(latest.game?.full?.[0]?.compressed_size)
      || toNumber(latest.game?.full?.[0]?.decompressed_size)

    return {
      version: latest.metadata.version,
      indexFileUrl: latest.metadata.index_file,
      resListUrl: normalizeResListUrl(latest.metadata.res_list_url),
      totalSize,
      diffs: mapDiffs(latest),
    }
  } catch (err) {
    console.error('[wuwa-api] Failed to fetch version info:', err)
    return null
  }
}

// Fetch the full file manifest from indexFile.json
export async function fetchWuwaManifest(indexFileUrl: string): Promise<WuwaFileEntry[]> {
  if (!indexCache.has(indexFileUrl)) {
    indexCache.set(
      indexFileUrl,
      fetchJSON<WuwaResourceManifest>(indexFileUrl).then((manifest) =>
        manifest.resource.map((entry) => ({
          dest: entry.dest,
          md5: entry.md5,
          size: toNumber(entry.size),
        }))
      )
    )
  }

  return indexCache.get(indexFileUrl)!
}

export async function detectWuwaInstalledVersion(installDir: string): Promise<string | null> {
  const localFiles = await Promise.all(
    WUWA_VERSION_FILES.map(async (relativePath) => {
      const fullPath = path.join(installDir, relativePath)
      if (!fs.existsSync(fullPath)) {
        return null
      }

      const stat = fs.statSync(fullPath)
      return {
        relativePath,
        size: stat.size,
        md5: (await streamingMd5(fullPath)).toLowerCase(),
      }
    })
  )

  const availableFiles = localFiles.filter((file): file is NonNullable<typeof file> => file !== null)
  if (availableFiles.length === 0) {
    return null
  }

  const manifest = await fetchWuwaTwintailManifest()
  for (const version of manifest.game_versions) {
    const entries = await fetchWuwaManifest(version.metadata.index_file)
    const entryMap = new Map(entries.map((entry) => [entry.dest, entry]))

    for (const localFile of availableFiles) {
      const manifestEntry = entryMap.get(localFile.relativePath)
      if (!manifestEntry) {
        continue
      }

      if (manifestEntry.size === localFile.size && manifestEntry.md5.toLowerCase() === localFile.md5) {
        return version.metadata.version
      }
    }
  }

  return null
}
