// Download system types for game downloads

// Download status for a game
export type DownloadStatus =
  | 'not_installed'
  | 'downloading'
  | 'paused'
  | 'extracting'
  | 'verifying'
  | 'installed'
  | 'update_available'
  | 'error'

// Download mode - how the game is delivered
export type DownloadMode = 'zip' | 'sophon' | 'raw'

// Progress information sent to renderer
export interface DownloadProgress {
  gameId: string
  status: DownloadStatus
  percent: number
  bytesDownloaded: number
  bytesTotal: number
  downloadSpeed: number // bytes per second
  timeRemaining: number // seconds
  currentFile?: string
  error?: string
}

// Game download state (stored in game config)
export interface GameDownloadState {
  status: DownloadStatus
  mode: DownloadMode
  currentVersion?: string
  latestVersion?: string
  totalBytes?: number
  downloadedBytes?: number
  installPath?: string
  manifestUrl?: string
  error?: string
}

// HoYoverse API game identifiers
export type HoyoGameBiz = 'genshin' | 'starrail' | 'zzz'

export interface WuwaDiffInfo {
  originalVersion: string
  indexFileUrl: string
  resListUrl: string
  downloadSize: number
  installedSize: number
}

// Wuthering Waves version info from Twintail's maintained manifest
export interface WuwaVersionInfo {
  version: string
  indexFileUrl: string   // URL to the full indexFile.json manifest
  resListUrl: string     // Base URL for raw file downloads
  totalSize: number      // sum of all file sizes (bytes)
  diffs: WuwaDiffInfo[]
}

// A single file entry from the WuWa resources.json manifest
export interface WuwaFileEntry {
  dest: string  // relative file path within the install directory
  md5: string
  size: number
}

// Game version info from official API
export interface HoyoVersionInfo {
  version: string
  downloadMode: DownloadMode
  zipUrl?: string
  zipMd5?: string
  zipSize?: number
  segments?: Array<{
    url: string
    md5: string
    size: number
  }>
  sophonManifestUrl?: string
  sophonChunkBaseUrl?: string // Base URL for downloading chunks (from Twintail's file_path)
  sophonManifests?: Array<{ manifestUrl: string; chunkBaseUrl: string }> // All manifests (multi-part games like ZZZ)
  voicePacks: VoicePack[]
  diffs: DiffPatch[]
}

// Voice pack info
export interface VoicePack {
  language: string
  name: string
  path: string
  md5: string
  size: string
  packageSize: string
}

// Delta patch info
export interface DiffPatch {
  version: string
  path: string
  md5: string
  size: string
  voicePacks: VoicePack[]
}

// Sophon manifest types
export interface SophonManifest {
  files: SophonManifestFile[]
}

export interface SophonManifestFile {
  name: string
  chunks: SophonFileChunk[]
  type: number // 64 = directory
  size: number
  md5: string
}

export interface SophonFileChunk {
  chunkName: string
  chunkDecompressedMd5: string
  chunkOnFileOffset: number
  chunkSize: number
  chunkDecompressedSize: number
  chunkMd5: string
}

// Download options
export interface DownloadOptions {
  gameId: string
  biz: HoyoGameBiz
  destDir: string
  manifestUrl?: string
  useTwintail?: boolean // Use Twintail manifest instead of official API
  preferVersion?: string // Specific version from Twintail
  onProgress?: (progress: DownloadProgress) => void
}
