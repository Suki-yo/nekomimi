import * as fs from 'fs'
import * as path from 'path'
import { extractArchive } from './archive'
import { downloadToFile, fetchJSON } from './download/utils'
import {
  STEAMRT_URL,
  buildSteamrtVersion,
  checkSteamrtUpdate,
  downloadSteamrt,
  findSteamrt,
  getSteamrtPath,
  readSteamrtRemoteMeta,
} from './steamrt'
import { getPathsInstance } from './paths'
import type { RunnerKind, RunnerStatus, RunnerUpdateInfo } from '../../shared/types/runner'

interface GitHubAsset {
  name: string
  browser_download_url: string
}

interface GitHubRelease {
  tag_name?: string
  assets?: GitHubAsset[]
}

interface ReleaseSource {
  kind: Extract<RunnerKind, 'proton-ge' | 'wine-ge' | 'xxmi-libs'>
  apiUrl: string
  htmlUrl: string
}

interface CacheEntry {
  tag: string
  fetchedAt: string
  sourceUrl: string
}

interface XxmiLibsMeta {
  tag: string
  installedAt: string
  sourceUrl: string
}

const DISPLAY_NAMES: Record<RunnerKind, string> = {
  'proton-ge': 'Proton GE',
  'wine-ge': 'Wine GE',
  'steam-runtime': 'Steam Linux Runtime',
  'xxmi-libs': 'XXMI Libs',
}

const RELEASE_SOURCES: ReleaseSource[] = [
  {
    kind: 'proton-ge',
    apiUrl: 'https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases/latest',
    htmlUrl: 'https://github.com/GloriousEggroll/proton-ge-custom/releases/latest',
  },
  {
    kind: 'wine-ge',
    apiUrl: 'https://api.github.com/repos/GloriousEggroll/wine-ge-custom/releases/latest',
    htmlUrl: 'https://github.com/GloriousEggroll/wine-ge-custom/releases/latest',
  },
  {
    kind: 'xxmi-libs',
    apiUrl: 'https://api.github.com/repos/SpectrumQT/XXMI-Libs-Package/releases/latest',
    htmlUrl: 'https://github.com/SpectrumQT/XXMI-Libs-Package/releases/latest',
  },
]

const CACHE_TTL_MS = 1000 * 60 * 60 * 12
const versionCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function cachePath(): string {
  return path.join(getPathsInstance().cache, 'runner-remote-versions.json')
}

function xxmiLibsMetaPath(): string {
  return path.join(getPathsInstance().xxmi, '.xxmi-libs-meta.json')
}

function readCache(): Partial<Record<RunnerKind, CacheEntry>> {
  try {
    return JSON.parse(fs.readFileSync(cachePath(), 'utf-8')) as Partial<Record<RunnerKind, CacheEntry>>
  } catch {
    return {}
  }
}

function writeCache(cache: Partial<Record<RunnerKind, CacheEntry>>): void {
  fs.mkdirSync(path.dirname(cachePath()), { recursive: true })
  fs.writeFileSync(cachePath(), JSON.stringify(cache, null, 2), 'utf-8')
}

function readXxmiLibsMeta(): XxmiLibsMeta | null {
  try {
    return JSON.parse(fs.readFileSync(xxmiLibsMetaPath(), 'utf-8')) as XxmiLibsMeta
  } catch {
    return null
  }
}

function writeXxmiLibsMeta(meta: XxmiLibsMeta): void {
  fs.mkdirSync(path.dirname(xxmiLibsMetaPath()), { recursive: true })
  fs.writeFileSync(xxmiLibsMetaPath(), JSON.stringify(meta, null, 2), 'utf-8')
}

export function compareVersions(left: string, right: string): number {
  const leftParts = left.toLowerCase().match(/\d+|[a-z]+/g) ?? [left.toLowerCase()]
  const rightParts = right.toLowerCase().match(/\d+|[a-z]+/g) ?? [right.toLowerCase()]
  const max = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < max; index += 1) {
    const leftPart = leftParts[index]
    const rightPart = rightParts[index]

    if (leftPart === undefined) {
      return -1
    }
    if (rightPart === undefined) {
      return 1
    }

    const leftIsNumber = /^\d+$/.test(leftPart)
    const rightIsNumber = /^\d+$/.test(rightPart)

    if (leftIsNumber && rightIsNumber) {
      const diff = Number(leftPart) - Number(rightPart)
      if (diff !== 0) {
        return diff
      }
      continue
    }

    const diff = versionCollator.compare(leftPart, rightPart)
    if (diff !== 0) {
      return diff
    }
  }

  return versionCollator.compare(left, right)
}

function listManagedRunnerDirs(): string[] {
  const runnersRoot = getPathsInstance().runners
  if (!fs.existsSync(runnersRoot)) {
    return []
  }

  return fs.readdirSync(runnersRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'steamrt')
    .map((entry) => entry.name)
}

function hasProtonLayout(root: string): boolean {
  return fs.existsSync(path.join(root, 'proton'))
    && fs.existsSync(path.join(root, 'files', 'bin', 'wine64'))
}

function hasWineLayout(root: string): boolean {
  return !fs.existsSync(path.join(root, 'proton'))
    && (
      fs.existsSync(path.join(root, 'files', 'bin', 'wine64'))
      || fs.existsSync(path.join(root, 'bin', 'wine64'))
    )
}

function isXxmiLibsInstalled(): boolean {
  const xxmiRoot = getPathsInstance().xxmi
  return fs.existsSync(path.join(xxmiRoot, 'd3d11.dll'))
    && fs.existsSync(path.join(xxmiRoot, 'd3dcompiler_47.dll'))
}

function listInstalledVersions(kind: RunnerKind): string[] {
  switch (kind) {
    case 'proton-ge':
      return listManagedRunnerDirs()
        .filter((name) => hasProtonLayout(path.join(getPathsInstance().runners, name)))
        .sort((left, right) => compareVersions(right, left))
    case 'wine-ge':
      return listManagedRunnerDirs()
        .filter((name) => hasWineLayout(path.join(getPathsInstance().runners, name)))
        .sort((left, right) => compareVersions(right, left))
    case 'steam-runtime': {
      const steamrtVersion = buildSteamrtVersion(readSteamrtRemoteMeta())
      return findSteamrt() ? [steamrtVersion ?? 'installed'] : []
    }
    case 'xxmi-libs': {
      if (!isXxmiLibsInstalled()) {
        return []
      }
      return [readXxmiLibsMeta()?.tag ?? 'installed']
    }
  }
}

function latestInstalledPath(kind: RunnerKind, version: string | null): string | null {
  if (!version) {
    return null
  }

  switch (kind) {
    case 'proton-ge':
    case 'wine-ge':
      return path.join(getPathsInstance().runners, version)
    case 'steam-runtime':
      return findSteamrt() ?? getSteamrtPath()
    case 'xxmi-libs':
      return getPathsInstance().xxmi
  }
}

export function listRunners(): RunnerStatus[] {
  const kinds: RunnerKind[] = ['proton-ge', 'wine-ge', 'steam-runtime', 'xxmi-libs']
  return kinds.map((kind) => {
    const installedVersions = listInstalledVersions(kind)
    const activeVersion = installedVersions[0] ?? null

    return {
      kind,
      displayName: DISPLAY_NAMES[kind],
      installedVersions,
      activeVersion,
      path: latestInstalledPath(kind, activeVersion),
    }
  })
}

async function fetchRemoteTag(source: ReleaseSource): Promise<string | null> {
  try {
    const release = await fetchJSON<GitHubRelease>(source.apiUrl)
    return release.tag_name ?? null
  } catch (error) {
    console.warn(`[runner-registry] failed to fetch ${source.kind}:`, error)
    return null
  }
}

async function resolveRemoteTag(kind: ReleaseSource['kind'], force = false): Promise<{ tag: string | null; sourceUrl: string; fetchedAt: string }> {
  const source = RELEASE_SOURCES.find((entry) => entry.kind === kind)
  if (!source) {
    throw new Error(`Unknown release source for ${kind}`)
  }

  const cache = readCache()
  const cached = cache[kind]
  const now = Date.now()
  const isFresh =
    !force
    && !!cached
    && (now - new Date(cached.fetchedAt).getTime()) < CACHE_TTL_MS

  if (isFresh && cached) {
    return { tag: cached.tag, sourceUrl: cached.sourceUrl, fetchedAt: cached.fetchedAt }
  }

  const tag = await fetchRemoteTag(source)
  const fetchedAt = new Date().toISOString()
  if (tag) {
    cache[kind] = { tag, fetchedAt, sourceUrl: source.htmlUrl }
    writeCache(cache)
  }

  return {
    tag,
    sourceUrl: source.htmlUrl,
    fetchedAt: tag ? fetchedAt : cached?.fetchedAt ?? fetchedAt,
  }
}

function buildUpdateInfo(kind: RunnerKind, remoteLatest: string | null, lastCheckedAt: string, sourceUrl: string): RunnerUpdateInfo {
  const installedLatest = listInstalledVersions(kind)[0] ?? null
  const upToDate = kind === 'steam-runtime' || kind === 'xxmi-libs'
    ? !!installedLatest && !!remoteLatest && installedLatest === remoteLatest
    : !!installedLatest && !!remoteLatest && compareVersions(installedLatest, remoteLatest) >= 0

  return {
    kind,
    installedLatest,
    remoteLatest,
    upToDate,
    lastCheckedAt,
    sourceUrl,
  }
}

export async function checkRunnerUpdates(): Promise<RunnerUpdateInfo[]> {
  const results: RunnerUpdateInfo[] = []

  for (const source of RELEASE_SOURCES) {
    const remote = await resolveRemoteTag(source.kind)
    results.push(buildUpdateInfo(source.kind, remote.tag, remote.fetchedAt, remote.sourceUrl))
  }

  try {
    const steamrtUpdate = await checkSteamrtUpdate()
    const remoteLatest = buildSteamrtVersion({
      etag: steamrtUpdate.remoteEtag,
      lastModified: steamrtUpdate.remoteLastModified,
    })
    results.push(buildUpdateInfo(
      'steam-runtime',
      remoteLatest,
      new Date().toISOString(),
      'https://repo.steampowered.com/steamrt3/images/latest-public-beta/',
    ))
  } catch (error) {
    console.warn('[runner-registry] failed to fetch steam runtime headers:', error)
    results.push(buildUpdateInfo(
      'steam-runtime',
      null,
      new Date(0).toISOString(),
      'https://repo.steampowered.com/steamrt3/images/latest-public-beta/',
    ))
  }

  return results.sort((left, right) => left.kind.localeCompare(right.kind))
}

function fetchReleaseUrl(kind: ReleaseSource['kind'], version?: string): string {
  const source = RELEASE_SOURCES.find((entry) => entry.kind === kind)
  if (!source) {
    throw new Error(`Unknown release source for ${kind}`)
  }

  if (!version) {
    return source.apiUrl
  }

  const repoPath = source.apiUrl.replace(/\/releases\/latest$/, '')
  return `${repoPath}/releases/tags/${encodeURIComponent(version)}`
}

async function fetchRelease(kind: ReleaseSource['kind'], version?: string): Promise<GitHubRelease> {
  return fetchJSON<GitHubRelease>(fetchReleaseUrl(kind, version))
}

function pickReleaseAsset(kind: ReleaseSource['kind'], assets: GitHubAsset[]): GitHubAsset | null {
  if (kind === 'xxmi-libs') {
    return assets.find((asset) => asset.name.toLowerCase().endsWith('.zip')) ?? null
  }

  return assets.find((asset) =>
    (asset.name.endsWith('.tar.gz') || asset.name.endsWith('.tar.xz'))
    && !asset.name.includes('.sha')
  ) ?? null
}

async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  await downloadToFile(url, {
    destPath,
    onProgress: (progress) => onProgress?.(progress.percent),
  })
}

function findFileRecursive(root: string, fileName: string): string | null {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
      return candidate
    }
    if (entry.isDirectory()) {
      const nested = findFileRecursive(candidate, fileName)
      if (nested) {
        return nested
      }
    }
  }

  return null
}

async function installGitHubArchive(kind: Extract<RunnerKind, 'proton-ge' | 'wine-ge'>, version: string, onProgress?: (percent: number) => void): Promise<void> {
  const release = await fetchRelease(kind, version)
  const asset = pickReleaseAsset(kind, release.assets ?? [])
  if (!asset) {
    throw new Error(`No archive asset found for ${kind} ${version}`)
  }

  const tempPath = path.join(getPathsInstance().cache, 'runner-downloads', asset.name)
  await downloadFile(asset.browser_download_url, tempPath, onProgress)
  try {
    fs.mkdirSync(getPathsInstance().runners, { recursive: true })
    await extractArchive({ src: tempPath, dest: getPathsInstance().runners })
  } finally {
    fs.rmSync(tempPath, { force: true })
  }
}

async function installXxmiLibs(version: string, onProgress?: (percent: number) => void): Promise<void> {
  const release = await fetchRelease('xxmi-libs', version)
  const asset = pickReleaseAsset('xxmi-libs', release.assets ?? [])
  if (!asset) {
    throw new Error(`No zip asset found for XXMI Libs ${version}`)
  }

  const tempDir = path.join(getPathsInstance().cache, 'xxmi-libs-temp')
  const tempZip = path.join(getPathsInstance().cache, 'runner-downloads', asset.name)

  fs.rmSync(tempDir, { recursive: true, force: true })
  await downloadFile(asset.browser_download_url, tempZip, onProgress)

  try {
    fs.mkdirSync(tempDir, { recursive: true })
    await extractArchive({ src: tempZip, dest: tempDir })

    const dllNames = ['d3d11.dll', 'd3dcompiler_47.dll'] as const
    fs.mkdirSync(getPathsInstance().xxmi, { recursive: true })

    for (const dllName of dllNames) {
      const source = findFileRecursive(tempDir, dllName)
      if (!source) {
        throw new Error(`Missing ${dllName} in XXMI Libs package`)
      }
      fs.copyFileSync(source, path.join(getPathsInstance().xxmi, dllName))
    }

    writeXxmiLibsMeta({
      tag: release.tag_name ?? version,
      installedAt: new Date().toISOString(),
      sourceUrl: RELEASE_SOURCES.find((entry) => entry.kind === 'xxmi-libs')!.htmlUrl,
    })
  } finally {
    fs.rmSync(tempZip, { force: true })
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

async function resolveInstallVersion(kind: Extract<RunnerKind, 'proton-ge' | 'wine-ge' | 'xxmi-libs'>, version?: string): Promise<string> {
  if (version) {
    return version
  }

  const remote = await resolveRemoteTag(kind)
  if (!remote.tag) {
    throw new Error(`Failed to resolve latest version for ${kind}`)
  }

  return remote.tag
}

export async function installRunner(
  request: { kind: RunnerKind; version?: string },
  onProgress?: (percent: number) => void,
): Promise<{ ok: boolean; installedTag?: string; error?: string }> {
  try {
    switch (request.kind) {
      case 'proton-ge': {
        const version = await resolveInstallVersion('proton-ge', request.version)
        await installGitHubArchive('proton-ge', version, onProgress)
        return { ok: true, installedTag: version }
      }
      case 'wine-ge': {
        const version = await resolveInstallVersion('wine-ge', request.version)
        await installGitHubArchive('wine-ge', version, onProgress)
        return { ok: true, installedTag: version }
      }
      case 'xxmi-libs': {
        const version = await resolveInstallVersion('xxmi-libs', request.version)
        await installXxmiLibs(version, onProgress)
        return { ok: true, installedTag: version }
      }
      case 'steam-runtime': {
        const result = await downloadSteamrt((percent) => onProgress?.(percent))
        if (!result.success) {
          return { ok: false, error: result.error ?? 'Steam Runtime installation failed' }
        }
        return {
          ok: true,
          installedTag: buildSteamrtVersion(readSteamrtRemoteMeta()) ?? 'installed',
        }
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function removeRunner(request: { kind: RunnerKind; version: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    switch (request.kind) {
      case 'proton-ge':
      case 'wine-ge':
        fs.rmSync(path.join(getPathsInstance().runners, request.version), { recursive: true, force: true })
        break
      case 'steam-runtime':
        fs.rmSync(getSteamrtPath(), { recursive: true, force: true })
        break
      case 'xxmi-libs':
        fs.rmSync(path.join(getPathsInstance().xxmi, 'd3d11.dll'), { force: true })
        fs.rmSync(path.join(getPathsInstance().xxmi, 'd3dcompiler_47.dll'), { force: true })
        fs.rmSync(xxmiLibsMetaPath(), { force: true })
        break
    }

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
