// Main download orchestrator
// Coordinates HoYoverse game downloads (zip and Sophon modes)

import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import { spawn } from 'child_process'
import { fetchGameResource } from './hoyo-api'
import { fetchEndfieldGame, fetchEndfieldVersionInfo } from './endfield-api'
import { fetchWuwaVersionInfo, fetchWuwaManifest, detectWuwaInstalledVersion } from './wuwa-api'
import { startWuwaDownload as _startWuwaDownload } from './wuwa-download'
import { downloadSophonGame } from './sophon'
import { streamingMd5 } from './utils'
import type {
  HoyoGameBiz,
  HoyoVersionInfo,
  DownloadOptions,
  DownloadProgress,
} from '../../../shared/types/download'

export { fetchEndfieldVersionInfo, fetchWuwaVersionInfo, fetchWuwaManifest, detectWuwaInstalledVersion }

// Active downloads tracking
const activeDownloads = new Map<string, AbortController>()

// Check if a download is in progress
export function isDownloadInProgress(gameId: string): boolean {
  return activeDownloads.has(gameId)
}

// Check if any downloads are active
export function hasActiveDownloads(): boolean {
  return activeDownloads.size > 0
}

// Cancel an active download
export function cancelDownload(gameId: string): boolean {
  const controller = activeDownloads.get(gameId)
  if (controller) {
    controller.abort()
    activeDownloads.delete(gameId)
    console.log(`[download] Cancelled download for ${gameId}`)
    return true
  }
  return false
}

// Get game version info from API
export async function getGameVersionInfo(biz: HoyoGameBiz): Promise<HoyoVersionInfo | null> {
  return fetchGameResource(biz)
}

// Check if a URL is accessible (returns 200)
async function isUrlAccessible(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = https.request(
      url,
      { method: 'HEAD', timeout: 10000 },
      (response) => {
        resolve(response.statusCode === 200)
      }
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.end()
  })
}

// Download file with progress (streams directly to disk — no in-memory buffering)
async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (percent: number, speed: number) => void
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    let downloaded = 0
    let lastReportTime = Date.now()
    let lastReportBytes = 0

    const followRedirect = (currentUrl: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        resolve({ success: false, error: 'Too many redirects' })
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
              resolve({ success: false, error: `HTTP ${response.statusCode}` })
              return
            }

            const totalSize = parseInt(response.headers['content-length'] || '0', 10)
            const fileStream = fs.createWriteStream(destPath)

            response.on('data', (chunk: Buffer) => {
              downloaded += chunk.length

              const now = Date.now()
              if (now - lastReportTime >= 500) {
                const timeDiff = (now - lastReportTime) / 1000
                const bytesDiff = downloaded - lastReportBytes
                const speed = bytesDiff / timeDiff

                if (totalSize > 0 && onProgress) {
                  onProgress(Math.round((downloaded / totalSize) * 100), speed)
                }

                lastReportTime = now
                lastReportBytes = downloaded
              }
            })

            response.pipe(fileStream)

            fileStream.on('finish', () => {
              fileStream.close()
              resolve({ success: true })
            })

            fileStream.on('error', (err) => {
              resolve({ success: false, error: err.message })
            })

            response.on('error', (err) => {
              fileStream.destroy()
              resolve({ success: false, error: err.message })
            })
          }
        )
        .on('error', (err) => {
          resolve({ success: false, error: err.message })
        })
    }

    followRedirect(url)
  })
}

// Extract zip file (uses 7z for split-archive support, falls back to unzip)
async function extractZip(
  zipPath: string,
  destDir: string,
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    // 7z handles split archives natively (no pre-merge needed)
    const proc = spawn('7z', ['x', zipPath, `-o${destDir}`, '-aoa', '-bsp1'], {
      stdio: 'pipe',
    })

    proc.stdout?.on('data', (data: Buffer) => {
      const match = data.toString().match(/(\d+)%/)
      if (match) onProgress?.(parseInt(match[1], 10))
    })

    proc.on('close', (code) => {
      if (code === 0) {
        onProgress?.(100)
        resolve({ success: true })
      } else {
        resolve({ success: false, error: `Extraction failed (exit code ${code})` })
      }
    })

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message })
    })
  })
}

// Download and extract a segmented zip (shared between HoYo zip mode and Endfield)
async function downloadSegmentedZip(
  gameId: string,
  destDir: string,
  versionInfo: HoyoVersionInfo,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ success: boolean; error?: string }> {
  const segments = versionInfo.segments!
  const totalSize = segments.reduce((sum, seg) => sum + seg.size, 0)
  let downloadedTotal = 0

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const segmentName = `game.zip.${String(i + 1).padStart(3, '0')}`
    const segmentPath = path.join(destDir, segmentName)

    onProgress?.({
      gameId,
      status: 'downloading',
      percent: Math.round((downloadedTotal / totalSize) * 100),
      bytesDownloaded: downloadedTotal,
      bytesTotal: totalSize,
      downloadSpeed: 0,
      timeRemaining: 0,
      currentFile: `Downloading ${segmentName} (${i + 1}/${segments.length})...`,
    })

    if (fs.existsSync(segmentPath)) {
      const existingMd5 = await streamingMd5(segmentPath)
      if (existingMd5 === segment.md5) {
        console.log(`[download] Segment ${i + 1}/${segments.length} already downloaded, skipping`)
        downloadedTotal += segment.size
        continue
      }
      console.log(`[download] Segment ${i + 1}/${segments.length} MD5 mismatch, re-downloading`)
    }

    console.log(`[download] Downloading segment ${i + 1}/${segments.length}: ${segment.url}`)
    const downloadResult = await downloadFile(segment.url, segmentPath, (percent, speed) => {
      const segmentDownloaded = (percent / 100) * segment.size
      onProgress?.({
        gameId,
        status: 'downloading',
        percent: Math.round(((downloadedTotal + segmentDownloaded) / totalSize) * 100),
        bytesDownloaded: downloadedTotal + segmentDownloaded,
        bytesTotal: totalSize,
        downloadSpeed: speed,
        timeRemaining: 0,
        currentFile: `Downloading ${segmentName}...`,
      })
    })

    if (!downloadResult.success) {
      return { success: false, error: `Failed to download ${segmentName}: ${downloadResult.error}` }
    }

    downloadedTotal += segment.size
  }

  onProgress?.({
    gameId,
    status: 'extracting',
    percent: 90,
    bytesDownloaded: totalSize,
    bytesTotal: totalSize,
    downloadSpeed: 0,
    timeRemaining: 0,
    currentFile: 'Extracting game files...',
  })

  // 7z extracts directly from the first split part without merging
  const firstSegment = path.join(destDir, 'game.zip.001')
  const extractResult = await extractZip(firstSegment, destDir, (percent) => {
    onProgress?.({
      gameId,
      status: 'extracting',
      percent: 90 + percent * 0.1,
      bytesDownloaded: totalSize,
      bytesTotal: totalSize,
      downloadSpeed: 0,
      timeRemaining: 0,
    })
  })

  for (let i = 0; i < segments.length; i++) {
    const segmentPath = path.join(destDir, `game.zip.${String(i + 1).padStart(3, '0')}`)
    if (fs.existsSync(segmentPath)) fs.unlinkSync(segmentPath)
  }

  if (extractResult.success) {
    onProgress?.({
      gameId,
      status: 'installed',
      percent: 100,
      bytesDownloaded: totalSize,
      bytesTotal: totalSize,
      downloadSpeed: 0,
      timeRemaining: 0,
    })
  }

  return extractResult
}

// Start a game download
export async function startGameDownload(
  options: DownloadOptions
): Promise<{ success: boolean; error?: string }> {
  const { gameId, biz, destDir, manifestUrl, useTwintail, preferVersion, onProgress } = options

  // Check if already downloading
  if (activeDownloads.has(gameId)) {
    return { success: false, error: 'Download already in progress' }
  }

  const controller = new AbortController()
  activeDownloads.set(gameId, controller)

  try {
    // Get version info from API
    onProgress?.({
      gameId,
      status: 'downloading',
      percent: 0,
      bytesDownloaded: 0,
      bytesTotal: 0,
      downloadSpeed: 0,
      timeRemaining: 0,
      currentFile: 'Fetching version info...',
    })

    const versionInfo = await fetchGameResource(biz, { useTwintail, preferVersion })
    if (!versionInfo) {
      return { success: false, error: 'Failed to fetch version info from API' }
    }

    console.log(`[download] ${biz} version: ${versionInfo.version}, mode: ${versionInfo.downloadMode}`)

    // Create destination directory
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }

    if (versionInfo.downloadMode === 'sophon') {
      // Sophon chunk-based download
      const url = manifestUrl || versionInfo.sophonManifestUrl
      if (!url) {
        console.log('[download] No Sophon manifest URL, falling back to zip mode')
        // Fall through to zip mode below
      } else {
        // Validate manifest URL is accessible before attempting Sophon download
        console.log(`[download] Checking Sophon manifest availability: ${url}`)
        const manifestAccessible = await isUrlAccessible(url)

        if (manifestAccessible) {
          // Log chunk base URL status
          if (versionInfo.sophonChunkBaseUrl) {
            console.log(`[download] Using explicit chunk base URL: ${versionInfo.sophonChunkBaseUrl}`)
          } else {
            console.log('[download] Will derive chunk base URL from manifest URL')
          }

          const result = await downloadSophonGame({
            ...(versionInfo.sophonManifests
              ? { manifests: versionInfo.sophonManifests }
              : { manifestUrl: url, chunkBaseUrl: versionInfo.sophonChunkBaseUrl }),
            destDir,
            concurrency: 6,
            onProgress: (progress) => {
              onProgress?.({
                gameId,
                status: progress.status || 'downloading',
                percent: progress.percent || 0,
                bytesDownloaded: progress.bytesDownloaded || 0,
                bytesTotal: progress.bytesTotal || 0,
                downloadSpeed: progress.downloadSpeed || 0,
                timeRemaining: progress.timeRemaining || 0,
                currentFile: progress.currentFile,
                error: progress.error,
              })
            },
          })

          return result
        } else {
          console.log('[download] Sophon manifest not accessible (404), falling back to zip mode')
          // Fall through to zip mode below
        }
      }
    }

    // Zip mode (either primary or fallback from Sophon)
    {
      // Check for segmented downloads first (multiple zip parts)
      if (versionInfo.segments && versionInfo.segments.length > 0) {
        console.log(`[download] Using segmented zip download (${versionInfo.segments.length} parts)`)
        return downloadSegmentedZip(gameId, destDir, versionInfo, onProgress)
      }

      // Single zip file
      if (!versionInfo.zipUrl) {
        return { success: false, error: 'No zip download URL available from API' }
      }

      onProgress?.({
        gameId,
        status: 'downloading',
        percent: 0,
        bytesDownloaded: 0,
        bytesTotal: versionInfo.zipSize || 0,
        downloadSpeed: 0,
        timeRemaining: 0,
        currentFile: 'Downloading game archive...',
      })

      // Download zip
      const zipPath = path.join(destDir, 'game.zip')
      const downloadResult = await downloadFile(
        versionInfo.zipUrl,
        zipPath,
        (percent, speed) => {
          onProgress?.({
            gameId,
            status: 'downloading',
            percent: percent * 0.9, // 90% for download
            bytesDownloaded: 0,
            bytesTotal: versionInfo.zipSize || 0,
            downloadSpeed: speed,
            timeRemaining: 0,
          })
        }
      )

      if (!downloadResult.success) {
        return downloadResult
      }

      // Extract zip
      onProgress?.({
        gameId,
        status: 'extracting',
        percent: 90,
        bytesDownloaded: versionInfo.zipSize || 0,
        bytesTotal: versionInfo.zipSize || 0,
        downloadSpeed: 0,
        timeRemaining: 0,
        currentFile: 'Extracting game files...',
      })

      const extractResult = await extractZip(zipPath, destDir, (percent) => {
        onProgress?.({
          gameId,
          status: 'extracting',
          percent: 90 + percent * 0.1, // 10% for extraction
          bytesDownloaded: versionInfo.zipSize || 0,
          bytesTotal: versionInfo.zipSize || 0,
          downloadSpeed: 0,
          timeRemaining: 0,
        })
      })

      // Clean up zip
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath)
      }

      if (extractResult.success) {
        onProgress?.({
          gameId,
          status: 'installed',
          percent: 100,
          bytesDownloaded: versionInfo.zipSize || 0,
          bytesTotal: versionInfo.zipSize || 0,
          downloadSpeed: 0,
          timeRemaining: 0,
        })
      }

      return extractResult
    }
  } catch (err) {
    console.error(`[download] Failed:`, err)
    onProgress?.({
      gameId,
      status: 'error',
      percent: 0,
      bytesDownloaded: 0,
      bytesTotal: 0,
      downloadSpeed: 0,
      timeRemaining: 0,
      error: String(err),
    })
    return { success: false, error: String(err) }
  } finally {
    activeDownloads.delete(gameId)
  }
}

export interface EndfieldDownloadOptions {
  gameId: string
  destDir: string
  onProgress?: (progress: DownloadProgress) => void
}

// Start an Arknights: Endfield download
export async function startEndfieldDownload(
  options: EndfieldDownloadOptions
): Promise<{ success: boolean; error?: string }> {
  const { gameId, destDir, onProgress } = options

  if (activeDownloads.has(gameId)) {
    return { success: false, error: 'Download already in progress' }
  }

  const controller = new AbortController()
  activeDownloads.set(gameId, controller)

  try {
    onProgress?.({
      gameId,
      status: 'downloading',
      percent: 0,
      bytesDownloaded: 0,
      bytesTotal: 0,
      downloadSpeed: 0,
      timeRemaining: 0,
      currentFile: 'Fetching version info...',
    })

    const versionInfo = await fetchEndfieldGame()
    if (!versionInfo) {
      return { success: false, error: 'Failed to fetch Endfield version info from API' }
    }

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }

    return await downloadSegmentedZip(gameId, destDir, versionInfo, onProgress)
  } catch (err) {
    console.error('[endfield] Download failed:', err)
    onProgress?.({
      gameId,
      status: 'error',
      percent: 0,
      bytesDownloaded: 0,
      bytesTotal: 0,
      downloadSpeed: 0,
      timeRemaining: 0,
      error: String(err),
    })
    return { success: false, error: String(err) }
  } finally {
    activeDownloads.delete(gameId)
  }
}

export interface WuwaDownloadOptions {
  gameId: string
  destDir: string
  onProgress?: (progress: DownloadProgress) => void
}

// Start a Wuthering Waves download
export async function startWuwaDownload(
  options: WuwaDownloadOptions
): Promise<{ success: boolean; error?: string }> {
  const { gameId, destDir, onProgress } = options

  if (activeDownloads.has(gameId)) {
    return { success: false, error: 'Download already in progress' }
  }

  const controller = new AbortController()
  activeDownloads.set(gameId, controller)

  try {
    return await _startWuwaDownload({ gameId, destDir, onProgress, signal: controller.signal })
  } finally {
    activeDownloads.delete(gameId)
  }
}
