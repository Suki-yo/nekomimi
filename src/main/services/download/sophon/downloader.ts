// Sophon chunk downloader
// Downloads chunks in parallel, decompresses with zstd, and assembles files

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { fetchManifest, getFilesOnly, calculateChunkDownloadSize } from './manifest'
import {
  createTransferProgressTracker,
  decompressZstd,
  downloadStream,
  sanitizePath,
  streamingMd5,
  createLruCache,
} from '../utils'
import type { SophonManifestFile, SophonFileChunk, DownloadProgress } from '../../../../shared/types/download'

// Download options
export interface SophonDownloadOptions {
  manifestUrl?: string
  chunkBaseUrl?: string // Optional explicit chunk base URL (from Twintail's file_path)
  manifests?: Array<{ manifestUrl: string; chunkBaseUrl?: string }> // Multiple manifests (e.g. ZZZ)
  destDir: string
  onProgress?: (progress: Partial<DownloadProgress>) => void
  concurrency?: number
}

// Download state
interface DownloadState {
  totalBytes: number
  downloadedBytes: number
  progressTracker: ReturnType<typeof createTransferProgressTracker>
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
  const chunks: Buffer[] = []

  await downloadStream(url, {
    onResponse: (response) => new Promise<void>((resolve, reject) => {
      response.on('data', (chunk: Buffer) => {
        state.downloadedBytes += chunk.length
        state.progressTracker.addDownloadedBytes(chunk.length)
        chunks.push(chunk)

        if (onProgress) {
          const snapshot = state.progressTracker.snapshot()
          if (snapshot.shouldReport) {
            onProgress(snapshot.progress)
          }
        }
      })

      response.once('end', () => {
        const buffer = Buffer.concat(chunks)
        const md5 = calculateMd5(buffer)

        if (md5 !== expectedMd5) {
          reject(new Error(`MD5 mismatch: expected ${expectedMd5}, got ${md5}`))
          return
        }

        resolve()
      })

      response.once('error', reject)
    }),
  })

  return Buffer.concat(chunks)
}

// Chunk cache to avoid re-downloading (LRU to limit memory)
const chunkCache = createLruCache<string, Buffer>(100)

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
  const filePath = sanitizePath(destDir, file.name)

  // Skip if already complete (resume support)
  if (fs.existsSync(filePath) && fs.statSync(filePath).size === file.size) {
    const existingMd5 = await streamingMd5(filePath)
    if (existingMd5 === file.md5) {
      const skippedBytes = file.chunks.reduce((sum, c) => sum + c.chunkSize, 0)
      state.downloadedBytes += skippedBytes
      state.progressTracker.addDownloadedBytes(skippedBytes)
      if (onProgress) {
        const snapshot = state.progressTracker.snapshot(true)
        onProgress(snapshot.progress)
      }
      return
    }
  }

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

  // Verify final file MD5 (streaming to avoid memory issues with large files)
  const md5 = await streamingMd5(filePath)

  if (md5 !== file.md5) {
    fs.unlinkSync(filePath)
    throw new Error(`File MD5 mismatch: ${file.name}`)
  }
}

// Resolve the list of manifests to download from options
function resolveManifestEntries(
  options: SophonDownloadOptions
): Array<{ manifestUrl: string; chunkBaseUrl?: string }> {
  if (options.manifests && options.manifests.length > 0) {
    return options.manifests
  }
  if (options.manifestUrl) {
    return [{ manifestUrl: options.manifestUrl, chunkBaseUrl: options.chunkBaseUrl }]
  }
  return []
}

function getBackupDir(destDir: string): string {
  const base = `${destDir}.previous`
  if (!fs.existsSync(base)) {
    return base
  }

  return `${base}-${Date.now()}`
}

function replaceDestWithStaging(stagingDir: string, destDir: string): void {
  const backupDir = fs.existsSync(destDir) ? getBackupDir(destDir) : null

  try {
    if (backupDir) {
      fs.renameSync(destDir, backupDir)
    }

    fs.renameSync(stagingDir, destDir)
  } catch (err) {
    if (backupDir && fs.existsSync(backupDir) && !fs.existsSync(destDir)) {
      fs.renameSync(backupDir, destDir)
    }
    throw err
  }

  if (backupDir && fs.existsSync(backupDir)) {
    try {
      fs.rmSync(backupDir, { recursive: true, force: true })
    } catch (err) {
      console.warn(`[sophon] Download installed, but failed to remove backup ${backupDir}:`, err)
    }
  }
}

// Download all files from a single manifest into stagingDir
async function downloadManifestFiles(
  manifestUrl: string,
  explicitChunkBaseUrl: string | undefined,
  stagingDir: string,
  state: DownloadState,
  concurrency: number,
  manifestIndex: number,
  manifestTotal: number,
  onProgress?: (progress: Partial<DownloadProgress>) => void
): Promise<void> {
  console.log(`[sophon] Manifest ${manifestIndex + 1}/${manifestTotal}: ${manifestUrl}`)

  onProgress?.({ status: 'downloading', currentFile: `manifest ${manifestIndex + 1}/${manifestTotal}` })
  const manifest = await fetchManifest(manifestUrl)

  const files = getFilesOnly(manifest)
  const totalChunkSize = calculateChunkDownloadSize(manifest)

  console.log(`[sophon] Manifest ${manifestIndex + 1}: ${files.length} files, ${(totalChunkSize / 1024 / 1024 / 1024).toFixed(2)} GB`)

  // Add this manifest's chunk size to the total
  state.totalBytes += totalChunkSize
  state.progressTracker.setTotalBytes(state.totalBytes)

  // Resolve chunk base URL
  let chunkBaseUrl: string
  if (explicitChunkBaseUrl) {
    chunkBaseUrl = explicitChunkBaseUrl
    console.log(`[sophon] Using explicit chunk base URL: ${chunkBaseUrl}`)
  } else {
    const manifestUrlObj = new URL(manifestUrl)
    const pathParts = manifestUrlObj.pathname.split('/')
    pathParts.pop()
    chunkBaseUrl = `${manifestUrlObj.origin}${pathParts.join('/')}`
    console.log(`[sophon] Derived chunk base URL from manifest: ${chunkBaseUrl}`)
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
          console.log(`[sophon] Manifest ${manifestIndex + 1} - Processed ${processedFiles}/${files.length}: ${file.name}`)
        } catch (err) {
          throw new Error(`Failed to process ${file.name}: ${err}`)
        }
      })
    )
  }
}

// Main download function
export async function downloadSophonGame(
  options: SophonDownloadOptions
): Promise<{ success: boolean; error?: string }> {
  const { destDir, onProgress, concurrency = 6 } = options

  const manifestEntries = resolveManifestEntries(options)
  if (manifestEntries.length === 0) {
    return { success: false, error: 'No manifest URL provided' }
  }

  console.log(`[sophon] Starting download to ${destDir}`)
  console.log(`[sophon] ${manifestEntries.length} manifest(s) to process`)
  console.log(`[sophon] Concurrency: ${concurrency}`)

  // Clear chunk cache
  chunkCache.clear()

  // Create destination directory
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }

  // Create staging directory (shared across all manifests for resume support)
  const stagingDir = `${destDir}.staging`
  if (!fs.existsSync(stagingDir)) {
    fs.mkdirSync(stagingDir, { recursive: true })
  }

  // Initialize download state (totalBytes will be accumulated as manifests are fetched)
  const state: DownloadState = {
    totalBytes: 0,
    downloadedBytes: 0,
    progressTracker: createTransferProgressTracker(0),
  }

  try {
    for (let i = 0; i < manifestEntries.length; i++) {
      const entry = manifestEntries[i]
      await downloadManifestFiles(
        entry.manifestUrl,
        entry.chunkBaseUrl,
        stagingDir,
        state,
        concurrency,
        i,
        manifestEntries.length,
        onProgress
      )
    }

    // Move from staging to final directory
    onProgress?.({ status: 'extracting', percent: 99 })
    console.log('[sophon] Moving files from staging...')

    replaceDestWithStaging(stagingDir, destDir)

    onProgress?.({ status: 'installed', percent: 100 })
    console.log('[sophon] Download complete!')

    return { success: true }
  } catch (err) {
    console.error('[sophon] Download failed:', err)
    onProgress?.({ status: 'error', error: String(err) })

    console.warn(`[sophon] Preserving staging directory for resume: ${stagingDir}`)

    return { success: false, error: String(err) }
  } finally {
    chunkCache.clear()
  }
}
