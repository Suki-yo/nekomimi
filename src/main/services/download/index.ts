// Main download orchestrator
// Coordinates HoYoverse game downloads (zip and Sophon modes)

import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import { spawn } from 'child_process'
import { fetchGameResource } from './hoyo-api'
import { downloadSophonGame } from './sophon'
import type {
  HoyoGameBiz,
  HoyoVersionInfo,
  DownloadOptions,
} from '../../../shared/types/download'

// Active downloads tracking
const activeDownloads = new Map<string, AbortController>()

// Check if a download is in progress
export function isDownloadInProgress(gameId: string): boolean {
  return activeDownloads.has(gameId)
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

// Download file with progress
async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (percent: number, speed: number) => void
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let downloaded = 0
    let startTime = Date.now()
    let lastReportTime = startTime
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

            response.on('data', (chunk: Buffer) => {
              chunks.push(chunk)
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

            response.on('end', () => {
              const buffer = Buffer.concat(chunks)
              fs.writeFileSync(destPath, buffer)
              resolve({ success: true })
            })

            response.on('error', (err) => {
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

// Extract zip file
async function extractZip(
  zipPath: string,
  destDir: string,
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    // Use unzip command for now
    const proc = spawn('unzip', ['-o', zipPath, '-d', destDir], {
      stdio: 'pipe',
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

// Start a game download
export async function startGameDownload(
  options: DownloadOptions
): Promise<{ success: boolean; error?: string }> {
  const { gameId, biz, destDir, manifestUrl, onProgress } = options

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

    const versionInfo = await fetchGameResource(biz)
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
        return { success: false, error: 'No Sophon manifest URL available' }
      }

      const result = await downloadSophonGame({
        manifestUrl: url,
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
      // Traditional zip download
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
        versionInfo.zipUrl!,
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
