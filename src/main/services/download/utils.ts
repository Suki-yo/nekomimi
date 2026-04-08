// Shared utilities for download services
// Consolidates common functionality to reduce code duplication

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as http from 'http'
import type { ClientRequest, IncomingMessage } from 'http'
import * as https from 'https'
import * as path from 'path'
import { spawn } from 'child_process'
import * as zlib from 'zlib'

// Configurable user agent
export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
export const REQUEST_TIMEOUT_MS = 15000

const MAX_REDIRECTS = 5

type DownloadHttpErrorCode = 'abort' | 'http' | 'network' | 'parse' | 'timeout'

export class DownloadHttpError extends Error {
  code: DownloadHttpErrorCode
  statusCode?: number
  responseBody?: string

  constructor(
    message: string,
    options: {
      code: DownloadHttpErrorCode
      statusCode?: number
      responseBody?: string
    }
  ) {
    super(message)
    this.name = 'DownloadHttpError'
    this.code = options.code
    this.statusCode = options.statusCode
    this.responseBody = options.responseBody
  }
}

function isRedirectStatus(statusCode?: number): boolean {
  return statusCode === 301
    || statusCode === 302
    || statusCode === 303
    || statusCode === 307
    || statusCode === 308
}

function getTransport(url: string): typeof http | typeof https {
  const protocol = new URL(url).protocol
  if (protocol === 'http:') {
    return http
  }
  if (protocol === 'https:') {
    return https
  }
  throw new DownloadHttpError(`Unsupported protocol: ${protocol}`, { code: 'http' })
}

function normalizeError(err: unknown, fallbackCode: DownloadHttpErrorCode = 'network'): DownloadHttpError {
  if (err instanceof DownloadHttpError) {
    return err
  }

  if (err instanceof Error) {
    const code = err.message === 'Request aborted' ? 'abort' : fallbackCode
    return new DownloadHttpError(err.message, { code })
  }

  return new DownloadHttpError(String(err), { code: fallbackCode })
}

function getResponseStream(response: IncomingMessage, decodeContentEncoding: boolean): NodeJS.ReadableStream {
  if (!decodeContentEncoding) {
    return response
  }

  const encoding = response.headers['content-encoding']
  if (typeof encoding !== 'string') {
    return response
  }

  if (encoding.includes('gzip')) {
    return response.pipe(zlib.createGunzip())
  }

  if (encoding.includes('deflate')) {
    return response.pipe(zlib.createInflate())
  }

  return response
}

async function readResponseText(
  response: IncomingMessage,
  decodeContentEncoding = false
): Promise<string> {
  const stream = getResponseStream(response, decodeContentEncoding)
  let data = ''

  for await (const chunk of stream) {
    data += typeof chunk === 'string' ? chunk : chunk.toString()
  }

  return data
}

function withResponse<T>(
  url: string,
  options: {
    headers?: Record<string, string>
    signal?: AbortSignal
  },
  onResponse: (response: IncomingMessage, contentLength: number) => Promise<T> | T
): Promise<T> {
  return new Promise((resolve, reject) => {
    let activeRequest: ClientRequest | null = null
    let activeResponse: IncomingMessage | null = null
    let settled = false

    const cleanup = () => {
      options.signal?.removeEventListener('abort', onAbort)
    }

    const fail = (err: unknown) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      reject(normalizeError(err))
    }

    const succeed = (value: T) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve(value)
    }

    const onAbort = () => {
      const err = new DownloadHttpError('Request aborted', { code: 'abort' })
      activeResponse?.destroy(err)
      activeRequest?.destroy(err)
      fail(err)
    }

    if (options.signal?.aborted) {
      fail(new DownloadHttpError('Request aborted', { code: 'abort' }))
      return
    }

    options.signal?.addEventListener('abort', onAbort, { once: true })

    const requestUrl = (currentUrl: string, redirectCount: number) => {
      if (redirectCount > MAX_REDIRECTS) {
        fail(new DownloadHttpError(`Too many redirects for URL: ${url}`, { code: 'http' }))
        return
      }

      let request: ClientRequest

      try {
        request = getTransport(currentUrl).request(
          currentUrl,
          {
            method: 'GET',
            headers: {
              'User-Agent': USER_AGENT,
              ...options.headers,
            },
          },
          (response) => {
            activeResponse = response
            clearTimeout(timeoutId)

            if (isRedirectStatus(response.statusCode)) {
              const location = response.headers.location
              if (!location) {
                fail(
                  new DownloadHttpError('Redirect response missing location header', {
                    code: 'http',
                    statusCode: response.statusCode,
                  })
                )
                return
              }

              response.resume()
              activeResponse = null
              requestUrl(new URL(location, currentUrl).toString(), redirectCount + 1)
              return
            }

            if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
              void readResponseText(response)
                .then((body) => {
                  fail(
                    new DownloadHttpError(
                      `HTTP ${response.statusCode}: ${response.statusMessage ?? 'Request failed'}`,
                      {
                        code: 'http',
                        statusCode: response.statusCode,
                        responseBody: body.substring(0, 500),
                      }
                    )
                  )
                })
                .catch((err) => fail(err))
              return
            }

            const contentLength = parseInt(response.headers['content-length'] || '0', 10) || 0
            Promise.resolve(onResponse(response, contentLength)).then(succeed, fail)
          }
        )
      } catch (err) {
        fail(err)
        return
      }

      activeRequest = request

      const timeoutId = setTimeout(() => {
        const err = new DownloadHttpError(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`, {
          code: 'timeout',
        })
        activeResponse?.destroy(err)
        request.destroy(err)
        fail(err)
      }, REQUEST_TIMEOUT_MS)

      request.on('error', (err) => {
        clearTimeout(timeoutId)
        if (settled) {
          return
        }
        fail(normalizeError(err))
      })

      request.end()
    }

    requestUrl(url, 0)
  })
}

export async function fetchJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  return withResponse(
    url,
    {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate',
      },
      signal,
    },
    async (response) => {
      const data = await readResponseText(response, true)
      const trimmedData = data.trim()

      if (trimmedData.startsWith('<!') || trimmedData.startsWith('<html')) {
        throw new DownloadHttpError('Received HTML instead of JSON', {
          code: 'parse',
          statusCode: response.statusCode,
          responseBody: trimmedData.substring(0, 500),
        })
      }

      try {
        return JSON.parse(data) as T
      } catch {
        throw new DownloadHttpError(`Failed to parse JSON: ${data.substring(0, 100)}`, {
          code: 'parse',
          statusCode: response.statusCode,
          responseBody: data.substring(0, 500),
        })
      }
    }
  )
}

export function downloadStream(
  url: string,
  options: {
    headers?: Record<string, string>
    onResponse: (res: IncomingMessage, contentLength: number) => Promise<void> | void
    signal?: AbortSignal
  }
): Promise<void> {
  return withResponse(url, {
    headers: options.headers,
    signal: options.signal,
  }, options.onResponse)
}

interface TransferSample {
  time: number
  bytes: number
}

export interface TransferProgressSnapshot {
  bytesDownloaded: number
  bytesTotal: number
  percent: number
  downloadSpeed: number
  timeRemaining: number
}

export function createTransferProgressTracker(
  totalBytes = 0,
  options?: {
    reportIntervalMs?: number
    sampleWindowMs?: number
  }
) {
  const reportIntervalMs = options?.reportIntervalMs ?? 250
  const sampleWindowMs = options?.sampleWindowMs ?? 4000

  let bytesTotal = totalBytes
  let bytesDownloaded = 0
  let lastReportTime = 0
  const samples: TransferSample[] = []

  function pruneSamples(now: number): void {
    while (samples.length > 1 && now - samples[0].time > sampleWindowMs) {
      samples.shift()
    }
  }

  function captureSnapshot(now: number): TransferProgressSnapshot {
    samples.push({ time: now, bytes: bytesDownloaded })
    pruneSamples(now)

    let downloadSpeed = 0
    if (samples.length >= 2) {
      const first = samples[0]
      const last = samples[samples.length - 1]
      const elapsedSeconds = (last.time - first.time) / 1000
      if (elapsedSeconds > 0) {
        downloadSpeed = Math.max(0, (last.bytes - first.bytes) / elapsedSeconds)
      }
    }

    const remainingBytes = Math.max(0, bytesTotal - bytesDownloaded)
    const timeRemaining = downloadSpeed > 0 ? Math.round(remainingBytes / downloadSpeed) : 0

    return {
      bytesDownloaded,
      bytesTotal,
      percent: bytesTotal > 0 ? Math.round((bytesDownloaded / bytesTotal) * 100) : 0,
      downloadSpeed: Math.round(downloadSpeed),
      timeRemaining,
    }
  }

  return {
    setTotalBytes(nextTotal: number): void {
      bytesTotal = Math.max(0, nextTotal)
    },
    setDownloadedBytes(nextDownloaded: number): void {
      bytesDownloaded = Math.max(0, nextDownloaded)
    },
    addDownloadedBytes(delta: number): void {
      bytesDownloaded = Math.max(0, bytesDownloaded + delta)
    },
    snapshot(force = false): { shouldReport: boolean; progress: TransferProgressSnapshot } {
      const now = Date.now()
      const progress = captureSnapshot(now)
      const shouldReport = force || lastReportTime === 0 || now - lastReportTime >= reportIntervalMs
      if (shouldReport) {
        lastReportTime = now
      }
      return { shouldReport, progress }
    },
  }
}

// Streaming MD5 for large files - avoids loading GB-scale files into memory
export async function streamingMd5(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

// Shared zstd decompression - uses system zstd binary to avoid WASM memory limits
export async function decompressZstd(compressed: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn('zstd', ['-d', '--stdout'], { stdio: ['pipe', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []

    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    proc.stderr.on('data', (data: Buffer) => console.error('[zstd]', data.toString().trim()))
    proc.on('error', (err) => reject(new Error(`zstd not found: ${err.message}`)))
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`zstd exited with code ${code}`))
      } else {
        resolve(Buffer.concat(chunks))
      }
    })

    proc.stdin.write(compressed)
    proc.stdin.end()
  })
}

// Prevent path traversal attacks - ensures resolved path stays within baseDir
export function sanitizePath(baseDir: string, userPath: string): string {
  // Remove path traversal attempts
  const normalized = path.normalize(userPath).replace(/^(\.\.[\/\\])+/, '')

  // Resolve to absolute path
  const resolved = path.resolve(baseDir, normalized)

  // Ensure it's within baseDir
  if (!resolved.startsWith(path.resolve(baseDir) + path.sep) && resolved !== path.resolve(baseDir)) {
    throw new Error(`Path traversal detected: ${userPath}`)
  }

  return resolved
}

// LRU cache entry
interface LruCacheEntry<V> {
  value: V
  timestamp: number
}

// Simple LRU cache implementation for memory management
export function createLruCache<K, V>(maxSize: number) {
  const cache = new Map<K, LruCacheEntry<V>>()

  return {
    get(key: K): V | undefined {
      const entry = cache.get(key)
      if (entry) {
        entry.timestamp = Date.now()
        return entry.value
      }
      return undefined
    },
    set(key: K, value: V): void {
      // Evict oldest if at capacity
      if (cache.size >= maxSize) {
        let oldestKey: K | null = null
        let oldestTime = Infinity
        for (const [k, v] of cache) {
          if (v.timestamp < oldestTime) {
            oldestTime = v.timestamp
            oldestKey = k
          }
        }
        if (oldestKey !== null) {
          cache.delete(oldestKey)
        }
      }
      cache.set(key, { value, timestamp: Date.now() })
    },
    has(key: K): boolean {
      return cache.has(key)
    },
    clear(): void {
      cache.clear()
    },
    size(): number {
      return cache.size
    },
  }
}

// Validate path doesn't contain shell metacharacters (command injection prevention)
export function validatePathForShell(filePath: string): void {
  if (/[;&|`$\\]/.test(filePath)) {
    throw new Error(`Path contains invalid characters: ${filePath}`)
  }
}
