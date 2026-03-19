// Wuthering Waves download orchestrator
// Downloads ~585 flat files from Kuro's CDN with concurrency + resume support

import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import { fetchWuwaVersionInfo, fetchWuwaManifest } from './wuwa-api'
import { streamingMd5 } from './utils'
import type { DownloadProgress, WuwaFileEntry } from '../../../shared/types/download'

const CONCURRENCY = 4

export interface WuwaDownloadOptions {
  gameId: string
  destDir: string
  onProgress?: (progress: DownloadProgress) => void
  signal?: AbortSignal
}

// Download a single file, returns bytes written (or -1 on failure)
function downloadFile(
  url: string,
  destPath: string,
  signal?: AbortSignal
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ success: false, error: 'Aborted' })
      return
    }

    const dir = path.dirname(destPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const followRedirect = (currentUrl: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        resolve({ success: false, error: 'Too many redirects' })
        return
      }

      const req = https.get(
        currentUrl,
        { headers: { 'User-Agent': 'Mozilla/5.0' } },
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

          const tmp = destPath + '.tmp'
          const fileStream = fs.createWriteStream(tmp)

          response.pipe(fileStream)

          fileStream.on('finish', () => {
            fileStream.close()
            try {
              fs.renameSync(tmp, destPath)
              resolve({ success: true })
            } catch (err) {
              resolve({ success: false, error: String(err) })
            }
          })

          fileStream.on('error', (err) => {
            fs.existsSync(tmp) && fs.unlinkSync(tmp)
            resolve({ success: false, error: err.message })
          })

          response.on('error', (err) => {
            fileStream.destroy()
            fs.existsSync(tmp) && fs.unlinkSync(tmp)
            resolve({ success: false, error: err.message })
          })

          signal?.addEventListener('abort', () => {
            req.destroy()
            fileStream.destroy()
            fs.existsSync(tmp) && fs.unlinkSync(tmp)
            resolve({ success: false, error: 'Aborted' })
          }, { once: true })
        }
      )

      req.on('error', (err) => resolve({ success: false, error: err.message }))
    }

    followRedirect(url)
  })
}

// Check if a file is already correctly downloaded
async function isFileComplete(filePath: string, entry: WuwaFileEntry): Promise<boolean> {
  if (!fs.existsSync(filePath)) return false
  const stat = fs.statSync(filePath)
  if (stat.size !== entry.size) return false
  const md5 = await streamingMd5(filePath)
  return md5.toLowerCase() === entry.md5.toLowerCase()
}

// Run tasks with limited concurrency
async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let index = 0

  const worker = async () => {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]()
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export async function startWuwaDownload(
  options: WuwaDownloadOptions
): Promise<{ success: boolean; error?: string }> {
  const { gameId, destDir, onProgress, signal } = options

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

    const versionInfo = await fetchWuwaVersionInfo()
    if (!versionInfo) {
      return { success: false, error: 'Failed to fetch Wuthering Waves version info from API' }
    }

    if (signal?.aborted) return { success: false, error: 'Aborted' }

    onProgress?.({
      gameId,
      status: 'downloading',
      percent: 0,
      bytesDownloaded: 0,
      bytesTotal: 0,
      downloadSpeed: 0,
      timeRemaining: 0,
      currentFile: 'Fetching file manifest...',
    })

    const entries = await fetchWuwaManifest(versionInfo.indexFileUrl)
    const totalSize = versionInfo.totalSize || entries.reduce((sum, e) => sum + e.size, 0)

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }

    let bytesDownloaded = 0
    let speedBytesAccum = 0
    let lastSpeedReport = Date.now()
    let currentSpeed = 0

    // Pre-count already-complete files
    for (const entry of entries) {
      const filePath = path.join(destDir, entry.dest)
      if (await isFileComplete(filePath, entry)) {
        bytesDownloaded += entry.size
      }
    }

    const tasks = entries.map((entry) => async () => {
      if (signal?.aborted) return

      const filePath = path.join(destDir, entry.dest)

      if (await isFileComplete(filePath, entry)) {
        return
      }

      const fileUrl = `${versionInfo.resListUrl}/${entry.dest}`

      const beforeBytes = bytesDownloaded
      const result = await downloadFile(fileUrl, filePath, signal)

      if (!result.success) {
        throw new Error(`Failed to download ${entry.dest}: ${result.error}`)
      }

      bytesDownloaded += entry.size
      speedBytesAccum += entry.size

      const now = Date.now()
      const elapsed = (now - lastSpeedReport) / 1000
      if (elapsed >= 0.5) {
        currentSpeed = speedBytesAccum / elapsed
        speedBytesAccum = 0
        lastSpeedReport = now
      }

      const remaining = currentSpeed > 0 ? (totalSize - bytesDownloaded) / currentSpeed : 0

      onProgress?.({
        gameId,
        status: 'downloading',
        percent: Math.round((bytesDownloaded / totalSize) * 100),
        bytesDownloaded,
        bytesTotal: totalSize,
        downloadSpeed: currentSpeed,
        timeRemaining: Math.round(remaining),
        currentFile: entry.dest,
      })

      void beforeBytes // suppress unused warning
    })

    await withConcurrency(tasks, CONCURRENCY)

    if (signal?.aborted) return { success: false, error: 'Aborted' }

    onProgress?.({
      gameId,
      status: 'installed',
      percent: 100,
      bytesDownloaded: totalSize,
      bytesTotal: totalSize,
      downloadSpeed: 0,
      timeRemaining: 0,
    })

    return { success: true }
  } catch (err) {
    console.error('[wuwa] Download failed:', err)
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
  }
}
