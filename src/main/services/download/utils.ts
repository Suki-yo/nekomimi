// Shared utilities for download services
// Consolidates common functionality to reduce code duplication

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'

// Configurable user agent
export const USER_AGENT = 'NekomimiLauncher/0.1.0'

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
