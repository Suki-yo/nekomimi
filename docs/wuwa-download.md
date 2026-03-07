# Wuthering Waves Direct Download API

## Overview

WuWa uses Kuro's "RAW" download system (`DOWNLOAD_MODE_RAW`) — completely different from HoYoverse's Sophon. No protobuf, no zstd, just plain HTTP file downloads indexed by a JSON manifest.

Source of truth: Twintail's `wuwa_global.json` manifest.

---

## API Flow

```
1. Fetch Twintail manifest (wuwa_global.json)
        |
        v
2. Extract index_file URL + res_list_url from latest version
        |
        v
3. GET {index_file} → indexFile.json
        |
        v
4. For each { dest, md5, size } in indexFile.resource[]:
   a. GET {res_list_url}/{dest}  → stream to {gameDir}/{dest}
   b. Validate MD5
        |
        v
5. Done — no extraction needed, files land in place
```

---

## Twintail Manifest

URL: `https://raw.githubusercontent.com/TwintailTeam/game-manifests/main/wuwa_global.json`

Relevant fields from `game_versions[0].metadata`:

```json
{
  "version": "3.1.2",
  "download_mode": "DOWNLOAD_MODE_RAW",
  "index_file": "https://hw-pcdownload-aws.aki-game.net/.../indexFile.json",
  "res_list_url": "https://hw-pcdownload-aws.aki-game.net/.../zip"
}
```

`game.full[0].file_url` = same as `index_file` (redundant, use `metadata.index_file`).

---

## indexFile.json Structure

```json
{
  "resource": [
    {
      "dest": "Wuthering Waves.exe",
      "md5": "584f23e6de2bf72eee8cd281cdb3e572",
      "size": 483768
    },
    {
      "dest": "Client/Binaries/Win64/Client-Win64-Shipping.exe",
      "md5": "50e06b322872776086884de7390988dd",
      "size": 81095688
    }
  ]
}
```

~134 GB total for 3.1.2. Thousands of entries including full game assets.

---

## File Download URL

```
{res_list_url}/{dest}
```

Confirmed: returns HTTP 200 directly, no `.zip` extension, no auth needed.

Example:
```
GET https://hw-pcdownload-aws.aki-game.net/.../zip/Wuthering%20Waves.exe
→ 200 OK, Content-Length: 483768
```

Files must be written to `{gameDir}/{dest}`, preserving directory structure.

---

## Implementation Plan

### New files

- `src/main/services/download/wuwa-api.ts` — fetch version info from Twintail `wuwa_global.json`
- `src/main/services/download/kuro/index.ts` — file-by-file downloader with concurrency + MD5 validation

### Changes

- `src/shared/types/download.ts` — add `WuwaVersionInfo`
- `src/main/services/download/index.ts` — add `startWuwaDownload()`
- `src/main/ipc/download.handler.ts` — add `download:fetch-wuwa-info` + `download:start-wuwa`
- `src/renderer/src/components/GameInstallModal.tsx` — support WuWa game

### WuwaVersionInfo type

```typescript
export interface WuwaVersionInfo {
  version: string
  indexFileUrl: string   // URL to indexFile.json
  resListUrl: string     // Base URL for file downloads
  totalSize: number      // Sum of all resource sizes
}
```

### Kuro downloader pseudocode

```typescript
async function downloadKuroGame(indexFileUrl, resListUrl, destDir, concurrency = 8, onProgress) {
  const index = await fetchJSON(indexFileUrl)           // { resource: [...] }
  const files = index.resource                          // [{ dest, md5, size }]
  const totalBytes = files.reduce((s, f) => s + f.size, 0)

  // Check already-downloaded files (skip if MD5 matches)
  // Download remaining with concurrency pool
  // For each file:
  //   mkdir -p destDir/dirname(dest)
  //   GET resListUrl/dest → stream to destDir/dest
  //   streamingMd5(destDir/dest) === file.md5 → else retry/error
}
```

---

## Delta patches (krdiff)

`game.diff[]` entries have `diff_type: "krdiff"` and their own `index_file` pointing to a diff-specific `indexFile.json`. The diff index likely contains only changed files with their new MD5s. The `file_hash` field in the diff entry is actually the `res_list_url` for the diff chunks (misnamed in Twintail's schema).

Not needed for fresh install — only for update from a previous version.

---

## CDN hosts

Two CDN options in the manifest:
- `hw-pcdownload-aws.aki-game.net` — AWS
- `hw-pcdownload-qcloud.aki-game.net` — Qcloud (Tencent)

Use AWS as primary, Qcloud as fallback if needed.
