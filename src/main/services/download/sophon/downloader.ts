// Sophon chunk downloader
// Downloads chunks in parallel, decompresses with zstd, and assembles files

import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as crypto from 'crypto'
import { ZstdCodec } from 'zstd-codec'
import { fetchManifest, getFilesOnly, calculateChunkDownloadSize } from './manifest'
import type { SophonManifestFile, SophonFileChunk, DownloadProgress } from '../../../../shared/types/download'

// Download options
export interface SophonDownloadOptions {
  manifestUrl: string
  destDir: string
  onProgress?: (progress: Partial<DownloadProgress>) => void
  concurrency?: number
}

// Download state
interface DownloadState {
  totalBytes: number
  downloadedBytes: number
  startTime: number
  speed: number
  speedSamples: Array<{ time: number; bytes: number }>
}

// Decompress zstd data
async function decompressZstd(compressed: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    ZstdCodec.run((zstd) => {
      try {
        const simple = new zstd.Simple()
        const decompressed = simple.decompress(compressed)
        resolve(Buffer.from(decompressed))
      } catch (err) {
        reject(err)
      }
    })
  })
}

// Calculate MD5 of buffer
function calculateMd5(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('hex')
}

// Download buffer from URL
async function downloadChunk(
  url: string,
  expectedMd5: string,
  state: DownloadState,
  onProgress?: (progress: Partial<DownloadProgress>) => void
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []

    const followRedirect = (currentUrl: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'))
        return
      }

      https
        .get(
          currentUrl,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0',
            },
          },
          (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
              const location = response.headers.location
              if (location) {
                followRedirect(location, redirectCount + 1)
                return
              }
            }

            if (response.statusCode !== 200) {
              reject(new Error(`HTTP ${response.statusCode}`))
              return
            }

            response.on('data', (chunk: Buffer) => {
              chunks.push(chunk)
              state.downloadedBytes += chunk.length

              // Update speed calculation
              const now = Date.now()
              state.speedSamples.push({ time: now, bytes: state.downloadedBytes })
              // Keep only last 10 samples
              if (state.speedSamples.length > 10) {
                state.speedSamples.shift()
              }

              // Calculate speed
              if (state.speedSamples.length >= 2) {
                const first = state.speedSamples[0]
                const last = state.speedSamples[state.speedSamples.length - 1]
                const timeDiff = (last.time - first.time) / 1000
                if (timeDiff > 0) {
                  state.speed = (last.bytes - first.bytes) / timeDiff
                }
              }

              // Report progress
              if (onProgress) {
                const remaining = state.speed > 0 ? (state.totalBytes - state.downloadedBytes) / state.speed : 0

                onProgress({
                  bytesDownloaded: state.downloadedBytes,
                  bytesTotal: state.totalBytes,
                  percent: Math.round((state.downloadedBytes / state.totalBytes) * 100),
                  downloadSpeed: Math.round(state.speed),
                  timeRemaining: Math.round(remaining),
                })
              }
            })

            response.on('end', () => {
              const buffer = Buffer.concat(chunks)
              const md5 = calculateMd5(buffer)

              if (md5 !== expectedMd5) {
                reject(new Error(`MD5 mismatch: expected ${expectedMd5}, got ${md5}`))
                return
              }

              resolve(buffer)
            })

            response.on('error', reject)
          }
        )
        .on('error', reject)
    }

    followRedirect(url)
  })
}

// Chunk cache to avoid re-downloading
const chunkCache = new Map<string, Buffer>()

// Download and cache a chunk
async function getChunk(
  chunkBaseUrl: string,
  chunk: SophonFileChunk,
  state: DownloadState,
  onProgress?: (progress: Partial<DownloadProgress>) => void
): Promise<Buffer> {
  // Check cache first
  if (chunkCache.has(chunk.chunkName)) {
    return chunkCache.get(chunk.chunkName)!
  }

  const chunkUrl = `${chunkBaseUrl}/${chunk.chunkName}`
  const compressed = await downloadChunk(chunkUrl, chunk.chunkMd5, state, onProgress)

  // Decompress
  const decompressed = await decompressZstd(compressed)

  // Verify decompressed MD5
  const decompressedMd5 = calculateMd5(decompressed)
  if (decompressedMd5 !== chunk.chunkDecompressedMd5) {
    throw new Error(`Decompressed MD5 mismatch for chunk ${chunk.chunkName}`)
  }

  // Cache for reuse
  chunkCache.set(chunk.chunkName, decompressed)

  return decompressed
}

// Process a single file - download chunks and assemble
async function processFile(
  file: SophonManifestFile,
  chunkBaseUrl: string,
  destDir: string,
  state: DownloadState,
  onProgress?: (progress: Partial<DownloadProgress>) => void
): Promise<void> {
  const filePath = path.join(destDir, file.name)

  // Create directory structure
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Create file with final size
  const fd = fs.openSync(filePath, 'w')
  fs.ftruncateSync(fd, file.size)

  try {
    // Download and write each chunk
    for (const chunk of file.chunks) {
      const decompressed = await getChunk(chunkBaseUrl, chunk, state, onProgress)

      // Write at correct offset
      fs.writeSync(fd, decompressed, 0, decompressed.length, chunk.chunkOnFileOffset)
    }
  } finally {
    fs.closeSync(fd)
  }

  // Verify final file MD5
  const fileBuffer = fs.readFileSync(filePath)
  const md5 = calculateMd5(fileBuffer)

  if (md5 !== file.md5) {
    fs.unlinkSync(filePath)
    throw new Error(`File MD5 mismatch: ${file.name}`)
  }
}

// Main download function
export async function downloadSophonGame(
  options: SophonDownloadOptions
): Promise<{ success: boolean; error?: string }> {
  const { manifestUrl, destDir, onProgress, concurrency = 6 } = options

  console.log(`[sophon] Starting download to ${destDir}`)
  console.log(`[sophon] Manifest URL: ${manifestUrl}`)
  console.log(`[sophon] Concurrency: ${concurrency}`)

  // Clear chunk cache
  chunkCache.clear()

  // Create destination directory
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }

  // Create staging directory
  const stagingDir = `${destDir}.staging`
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true })
  }
  fs.mkdirSync(stagingDir, { recursive: true })

  try {
    // Fetch and parse manifest
    onProgress?.({ status: 'downloading', currentFile: 'manifest' })
    const manifest = await fetchManifest(manifestUrl)

    // Get files only (exclude directories)
    const files = getFilesOnly(manifest)
    const totalChunkSize = calculateChunkDownloadSize(manifest)

    console.log(`[sophon] ${files.length} files to download`)
    console.log(`[sophon] Total chunk size: ${(totalChunkSize / 1024 / 1024 / 1024).toFixed(2)} GB`)

    // Extract chunk base URL from manifest URL
    const manifestUrlObj = new URL(manifestUrl)
    const pathParts = manifestUrlObj.pathname.split('/')
    pathParts.pop() // Remove manifest filename
    const chunkBaseUrl = `${manifestUrlObj.origin}${pathParts.join('/')}`

    // Initialize download state
    const state: DownloadState = {
      totalBytes: totalChunkSize,
      downloadedBytes: 0,
      startTime: Date.now(),
      speed: 0,
      speedSamples: [],
    }

    // Process files in parallel batches
    const batches: SophonManifestFile[][] = []
    for (let i = 0; i < files.length; i += concurrency) {
      batches.push(files.slice(i, i + concurrency))
    }

    let processedFiles = 0
    for (const batch of batches) {
      await Promise.all(
        batch.map(async (file) => {
          try {
            onProgress?.({ currentFile: file.name })
            await processFile(file, chunkBaseUrl, stagingDir, state, onProgress)
            processedFiles++
            console.log(`[sophon] Processed ${processedFiles}/${files.length}: ${file.name}`)
          } catch (err) {
            throw new Error(`Failed to process ${file.name}: ${err}`)
          }
        })
      )
    }

    // Move from staging to final directory
    onProgress?.({ status: 'extracting', percent: 99 })
    console.log('[sophon] Moving files from staging...')

    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true })
    }
    fs.renameSync(stagingDir, destDir)

    onProgress?.({ status: 'installed', percent: 100 })
    console.log('[sophon] Download complete!')

    return { success: true }
  } catch (err) {
    console.error('[sophon] Download failed:', err)
    onProgress?.({ status: 'error', error: String(err) })

    // Clean up staging directory
    if (fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true })
    }

    return { success: false, error: String(err) }
  } finally {
    chunkCache.clear()
  }
}
