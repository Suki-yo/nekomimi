// Sophon manifest parser
// Fetches, decompresses (zstd), and parses protobuf manifests

import { decodeManifest } from './proto'
import { decompressZstd, downloadStream } from '../utils'
import type { SophonManifest, SophonManifestFile } from '../../../../shared/types/download'

// Simple progress callback type
export type ProgressCallback = (percent: number) => void

// Fetch raw data from URL
function fetchBuffer(url: string, onProgress?: ProgressCallback): Promise<Buffer> {
  const chunks: Buffer[] = []

  console.log(`[sophon] Fetching: ${url}`)
  return downloadStream(url, {
    onResponse: (response, totalSize) => new Promise<void>((resolve, reject) => {
      let downloaded = 0

      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        downloaded += chunk.length
        if (totalSize > 0 && onProgress) {
          onProgress(Math.round((downloaded / totalSize) * 100))
        }
      })

      response.once('end', () => resolve())
      response.once('error', reject)
    }),
  }).then(() => Buffer.concat(chunks))
}

// Fetch and parse Sophon manifest
export async function fetchManifest(
  url: string,
  onProgress?: ProgressCallback
): Promise<SophonManifest> {
  console.log(`[sophon] Fetching manifest from ${url}`)

  try {
    // Download the compressed manifest
    const compressed = await fetchBuffer(url, (percent) => {
      console.log(`[sophon] Manifest download: ${percent}%`)
      onProgress?.(percent * 0.5) // First 50% is download
    })

    console.log(`[sophon] Manifest size: ${compressed.length} bytes (compressed)`)

    // Decompress with zstd
    console.log('[sophon] Decompressing manifest...')
    const decompressed = await decompressZstd(compressed)

    console.log(`[sophon] Manifest size: ${decompressed.length} bytes (decompressed)`)
    onProgress?.(75) // 75% after decompression

    // Parse protobuf
    console.log('[sophon] Parsing protobuf...')
    const protoManifest = decodeManifest(decompressed)

    // Convert to our types (camelCase)
    const manifest: SophonManifest = {
      files: protoManifest.files.map((file) => ({
        name: file.name,
        chunks: file.chunks.map((chunk) => ({
          chunkName: chunk.chunkName,
          chunkDecompressedMd5: chunk.chunkDecompressedMd5,
          chunkOnFileOffset: chunk.chunkOnFileOffset,
          chunkSize: chunk.chunkSize,
          chunkDecompressedSize: chunk.chunkDecompressedSize,
          chunkMd5: chunk.chunkMd5,
        })),
        type: file.type,
        size: file.size,
        md5: file.md5,
      })),
    }

    onProgress?.(100)
    console.log(`[sophon] Manifest parsed: ${manifest.files.length} files`)

    return manifest
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[sophon] Failed to fetch manifest from ${url}`)
    console.error(`[sophon] Error: ${errorMsg}`)
    throw new Error(`Failed to fetch Sophon manifest: ${errorMsg}`)
  }
}

// Filter out directories (type 64) and get only files
export function getFilesOnly(manifest: SophonManifest): SophonManifestFile[] {
  return manifest.files.filter((file) => file.type !== 64)
}

// Calculate total download size
export function calculateTotalSize(manifest: SophonManifest): number {
  const files = getFilesOnly(manifest)
  return files.reduce((total, file) => total + file.size, 0)
}

// Calculate total chunk download size (compressed)
export function calculateChunkDownloadSize(manifest: SophonManifest): number {
  const files = getFilesOnly(manifest)
  const uniqueChunks = new Set<string>()

  let totalChunkSize = 0
  for (const file of files) {
    for (const chunk of file.chunks) {
      if (!uniqueChunks.has(chunk.chunkName)) {
        uniqueChunks.add(chunk.chunkName)
        totalChunkSize += chunk.chunkSize
      }
    }
  }

  return totalChunkSize
}
