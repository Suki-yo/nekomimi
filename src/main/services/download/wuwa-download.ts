// Wuthering Waves download orchestrator
// Downloads ~585 flat files from Kuro's CDN with concurrency + resume support

import * as fs from 'fs'
import * as path from 'path'
import { fetchWuwaVersionInfo, fetchWuwaManifest } from './wuwa-api'
import { createTransferProgressTracker, downloadToFile, streamingMd5 } from './utils'
import type { DownloadProgress, WuwaFileEntry } from '../../../shared/types/download'

const CONCURRENCY = 4

export interface WuwaDownloadOptions {
  gameId: string
  destDir: string
  onProgress?: (progress: DownloadProgress) => void
  signal?: AbortSignal
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
    const progressTracker = createTransferProgressTracker(totalSize)

    // Pre-count already-complete files
    for (const entry of entries) {
      const filePath = path.join(destDir, entry.dest)
      if (await isFileComplete(filePath, entry)) {
        bytesDownloaded += entry.size
      }
    }
    progressTracker.setDownloadedBytes(bytesDownloaded)

    const emitProgress = (currentFile: string, force = false) => {
      const snapshot = progressTracker.snapshot(force)
      if (!snapshot.shouldReport) {
        return
      }
      onProgress?.({
        gameId,
        status: 'downloading',
        percent: snapshot.progress.percent,
        bytesDownloaded: snapshot.progress.bytesDownloaded,
        bytesTotal: snapshot.progress.bytesTotal,
        downloadSpeed: snapshot.progress.downloadSpeed,
        timeRemaining: snapshot.progress.timeRemaining,
        currentFile,
      })
    }

    const tasks = entries.map((entry) => async () => {
      if (signal?.aborted) return

      const filePath = path.join(destDir, entry.dest)

      if (await isFileComplete(filePath, entry)) {
        return
      }

      const fileUrl = `${versionInfo.resListUrl}/${entry.dest}`
      let reportedBytes = 0

      try {
        await downloadToFile(fileUrl, {
          destPath: filePath,
          signal,
          onProgress: (progress) => {
            const delta = progress.bytesDownloaded - reportedBytes
            if (delta <= 0) {
              return
            }

            reportedBytes = progress.bytesDownloaded
            bytesDownloaded += delta
            progressTracker.addDownloadedBytes(delta)
            emitProgress(entry.dest)
          },
        })
      } catch (error) {
        throw new Error(`Failed to download ${entry.dest}: ${error instanceof Error ? error.message : String(error)}`)
      }

      emitProgress(entry.dest, true)
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
