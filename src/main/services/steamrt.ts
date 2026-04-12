// Steam Runtime (pressure-vessel/sniper) management
// Used to launch Proton games without depending on umu-run

import { createWriteStream, existsSync, readFileSync, writeFileSync } from 'fs'
import { mkdir, rm } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { getPathsInstance } from './paths'

// umu-launcher uses this URL (with a cache-busting token, but base is stable)
export const STEAMRT_URL =
  'https://repo.steampowered.com/steamrt3/images/latest-public-beta/SteamLinuxRuntime_3.tar.xz'

export interface SteamrtRemoteMeta {
  etag?: string
  lastModified?: string
  downloadedAt: string
  url: string
}

export function getSteamrtPath(): string {
  return join(getPathsInstance().runners, 'steamrt')
}

function getSteamrtRemoteMetaPath(): string {
  return join(getSteamrtPath(), '.remote-meta.json')
}

export function readSteamrtRemoteMeta(): SteamrtRemoteMeta | null {
  try {
    return JSON.parse(readFileSync(getSteamrtRemoteMetaPath(), 'utf-8')) as SteamrtRemoteMeta
  } catch {
    return null
  }
}

function writeSteamrtRemoteMeta(meta: SteamrtRemoteMeta): void {
  writeFileSync(getSteamrtRemoteMetaPath(), JSON.stringify(meta, null, 2), 'utf-8')
}

export function buildSteamrtVersion(meta: Pick<SteamrtRemoteMeta, 'etag' | 'lastModified'> | null | undefined): string | null {
  if (!meta) {
    return null
  }

  return meta.etag ?? meta.lastModified ?? null
}

export function isSteamrtInstalled(): boolean {
  return existsSync(join(getSteamrtPath(), '_v2-entry-point'))
}

/** Returns the path to the steamrt installation, checking nekomimi's managed path first,
 *  then umu-launcher's, then vanilla Steam's. Returns null if none found. */
export function findSteamrt(): string | null {
  const candidates = [
    getSteamrtPath(),
    join(homedir(), '.local/share/umu/steamrt3'),
    join(homedir(), '.local/share/Steam/steamapps/common/SteamLinuxRuntime_sniper'),
  ]
  for (const p of candidates) {
    if (existsSync(join(p, '_v2-entry-point'))) return p
  }
  return null
}

export async function downloadSteamrt(
  onProgress: (percent: number) => void
): Promise<{ success: boolean; error?: string }> {
  const destDir = getSteamrtPath()

  try {
    await mkdir(destDir, { recursive: true })

    const response = await fetch(STEAMRT_URL)
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const remoteMeta: SteamrtRemoteMeta = {
      etag: response.headers.get('etag') ?? undefined,
      lastModified: response.headers.get('last-modified') ?? undefined,
      downloadedAt: new Date().toISOString(),
      url: STEAMRT_URL,
    }

    const totalSize = parseInt(response.headers.get('content-length') || '0', 10)
    let downloaded = 0

    // Stream download → xz decompress → tar extract
    // Node's built-in zlib doesn't support xz — use tar's built-in xz support via shell
    // Write to a temp file first then extract
    const tmpFile = join(destDir, '_download.tar.xz')

    const fileStream = createWriteStream(tmpFile)
    const reader = response.body.getReader()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fileStream.write(value)
        downloaded += value.length
        if (totalSize > 0) {
          onProgress(Math.round((downloaded / totalSize) * 80)) // 0-80% for download
        }
      }
    } finally {
      fileStream.end()
      await new Promise<void>((resolve) => fileStream.on('finish', resolve))
    }

    onProgress(80)

    // Extract using tar (system tar supports xz natively)
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const execFileAsync = promisify(execFile)

    await execFileAsync('tar', [
      '--extract',
      '--xz',
      '--file', tmpFile,
      '--directory', destDir,
      '--strip-components=1', // SteamLinuxRuntime_3/* → steamrt/*
    ])

    onProgress(95)

    await rm(tmpFile, { force: true })

    // Ensure _v2-entry-point is executable
    await execFileAsync('chmod', ['+x', join(destDir, '_v2-entry-point')])

    onProgress(100)

    if (!isSteamrtInstalled()) {
      throw new Error('Extraction completed but _v2-entry-point not found')
    }

    writeSteamrtRemoteMeta(remoteMeta)

    return { success: true }
  } catch (err) {
    // Clean up on failure
    await rm(destDir, { recursive: true, force: true }).catch(() => {})
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function checkSteamrtUpdate(): Promise<{
  upToDate: boolean
  remoteEtag?: string
  remoteLastModified?: string
}> {
  const installedMeta = readSteamrtRemoteMeta()

  const headers: Record<string, string> = {}
  if (installedMeta?.etag) {
    headers['If-None-Match'] = installedMeta.etag
  }
  if (installedMeta?.lastModified) {
    headers['If-Modified-Since'] = installedMeta.lastModified
  }

  const response = await fetch(STEAMRT_URL, {
    method: 'HEAD',
    headers,
  })

  if (response.status === 304) {
    return {
      upToDate: true,
      remoteEtag: installedMeta?.etag,
      remoteLastModified: installedMeta?.lastModified,
    }
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const remoteEtag = response.headers.get('etag') ?? undefined
  const remoteLastModified = response.headers.get('last-modified') ?? undefined
  const installedVersion = buildSteamrtVersion(installedMeta)
  const remoteVersion = buildSteamrtVersion({
    etag: remoteEtag,
    lastModified: remoteLastModified,
  })

  return {
    upToDate: !!installedVersion && !!remoteVersion && installedVersion === remoteVersion,
    remoteEtag,
    remoteLastModified,
  }
}
