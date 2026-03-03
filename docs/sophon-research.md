# HoYoverse Sophon Download System - Research Summary

Based on analysis of Twintail Launcher and fischl-rs library.

---

## Overview

HoYoverse games (Genshin Impact, Honkai Star Rail, Zenless Zone Zero) use a **chunk-based download system** called "Sophon" that:

1. Splits game files into compressed chunks
2. Downloads chunks in parallel from CDN
3. Validates each chunk with MD5 checksums
4. Decompresses chunks using zstd
5. Assembles files directly to game folder
6. Supports delta patching via hdiff

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Sophon Download Flow                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Download Manifest URL (zstd-compressed protobuf)           │
│            │                                                    │
│            ▼                                                    │
│  2. Decompress with zstd → SophonManifest/SophonDiff protobuf  │
│            │                                                    │
│            ▼                                                    │
│  3. Parse manifest → List of files with chunks                  │
│            │                                                    │
│            ▼                                                    │
│  4. For each file:                                              │
│     ┌─────────────────────────────────────────┐                │
│     │ For each chunk in file:                 │                │
│     │   a. Download chunk from CDN            │                │
│     │   b. Validate MD5                       │                │
│     │   c. Decompress with zstd               │                │
│     │   d. Write to file at offset            │                │
│     └─────────────────────────────────────────┘                │
│            │                                                    │
│            ▼                                                    │
│  5. Validate final file MD5                                     │
│            │                                                    │
│            ▼                                                    │
│  6. Move from staging to game directory                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Structures

### SophonManifest (Full Download)

```protobuf
message SophonManifest {
  repeated ManifestFile files = 1;
}

message ManifestFile {
  string name = 1;                    // File path relative to game dir
  repeated FileChunk chunks = 2;      // List of chunks that make up this file
  int32 type = 3;                     // 64 = directory, skip
  uint64 size = 4;                    // Final file size
  string md5 = 5;                     // MD5 of complete file
}

message FileChunk {
  string chunk_name = 1;              // e.g., "abc123.zip"
  string chunk_decompressed_md5 = 2;  // MD5 after decompression
  uint64 chunk_on_file_offset = 3;    // Where to write in final file
  uint64 chunk_size = 4;              // Compressed size
  uint64 chunk_decompressed_size = 5; // Size after zstd decompression
  uint64 something = 6;               // Unknown
  string chunk_md5 = 7;               // MD5 of compressed chunk
}
```

### SophonDiff (Delta Patch)

```protobuf
message SophonDiff {
  repeated PatchFile files = 1;
  map<string, DeleteFiles> delete_files = 2;  // Files to delete after patch
}

message PatchFile {
  string name = 1;
  uint64 size = 2;
  string md5 = 3;                     // MD5 AFTER patching
  map<string, PatchChunk> chunks = 4; // Keyed by version
}

message PatchChunk {
  string patch_name = 1;              // Chunk file to download
  string version = 2;
  string build_id = 3;
  uint64 patch_size = 4;
  string patch_md5 = 5;               // MD5 of patch chunk
  uint64 patch_offset = 6;            // Offset in chunk file
  uint64 patch_length = 7;            // Length of patch data
  string original_filename = 8;       // Original file to patch (for hdiff)
  uint64 original_file_length = 9;
  string original_md5 = 10;           // MD5 BEFORE patching
}
```

---

## URL Structure

Based on Twintail's manifest format:

```typescript
interface GameVersion {
  metadata: {
    versioned_name: string;      // e.g., "Genshin Impact 6.4"
    version: string;             // e.g., "6.4.0"
    download_mode: string;       // "DOWNLOAD_MODE_CHUNK" for Sophon
    game_hash: string;
    index_file: string;          // Manifest URL (zstd compressed)
    res_list_url: string;        // Chunk base URL
    diff_list_url: {             // Diff manifest URLs by language
      game: string;
      en_us: string;
      zh_cn: string;
      ja_jp: string;
      ko_kr: string;
    };
  };
  game: {
    full: FullGameFile[];        // Full download entries
    diff: DiffGameFile[];        // Delta patch entries
  };
  audio: {
    full: FullAudioFile[];       // Audio packages by language
    diff: DiffAudioFile[];
  };
}

interface FullGameFile {
  file_url: string;              // Manifest URL
  file_path: string;             // Chunk base URL
  compressed_size: string;
  decompressed_size: string;
  file_hash: string;
}
```

---

## Key Implementation Details

### 1. Manifest Download & Parse

```typescript
async function downloadManifest(url: string): Promise<SophonManifest> {
  // Download zstd-compressed protobuf
  const compressed = await fetch(url);

  // Decompress with zstd
  const decompressed = await zstdDecompress(compressed);

  // Parse protobuf
  return SophonManifest.decode(decompressed);
}
```

### 2. Parallel Chunk Download (fischl-rs uses 6-30 workers)

```typescript
async function processFileChunks(
  file: ManifestFile,
  chunkBase: string,
  stagingDir: string
): Promise<void> {
  // Create file with final size
  const fd = fs.openSync(stagingDir + '/' + file.name, 'w');
  fs.truncateSync(fd, file.size);

  // Process chunks in parallel
  await Promise.all(file.chunks.map(chunk =>
    downloadAndWriteChunk(chunk, chunkBase, fd)
  ));
}

async function downloadAndWriteChunk(
  chunk: FileChunk,
  chunkBase: string,
  fd: number
): Promise<void> {
  // Download chunk
  const chunkUrl = `${chunkBase}/${chunk.chunk_name}`;
  const compressed = await fetch(chunkUrl);

  // Validate MD5
  if (md5(compressed) !== chunk.chunk_md5.toLowerCase()) {
    throw new Error('Chunk MD5 mismatch');
  }

  // Decompress with zstd
  const decompressed = await zstdDecompress(compressed);

  // Write at offset
  fs.writeSync(fd, decompressed, 0, decompressed.length, chunk.chunk_on_file_offset);
}
```

### 3. File Validation & Assembly

```typescript
async function validateFile(
  file: ManifestFile,
  stagingPath: string
): Promise<boolean> {
  const hash = await md5File(stagingPath);
  return hash === file.md5.toLowerCase();
}
```

### 4. Delta Patching (hdiff)

```typescript
async function applyPatch(
  patchChunk: PatchChunk,
  gameDir: string,
  stagingDir: string
): Promise<void> {
  // Download patch chunk
  const patchData = await downloadPatch(patchChunk);

  if (patchChunk.original_filename) {
    // HDIFF patch - apply to original file
    const originalFile = gameDir + '/' + patchChunk.original_filename;
    const outputFile = stagingDir + '/' + patchFile.name;
    await hpatchz(originalFile, patchData, outputFile);
  } else {
    // Direct copy (no patching needed)
    fs.writeFileSync(stagingDir + '/' + patchFile.name, patchData);
  }
}
```

---

## Required Dependencies

| Dependency | Purpose |
|------------|---------|
| `zstd` | Decompress chunks and manifests |
| `protobuf` | Parse SophonManifest/SophonDiff |
| `hpatchz` | Apply HDIFF delta patches |
| `md5` | Validate file/chunk checksums |

### Node.js Packages

```json
{
  "dependencies": {
    "zstd-codec": "^0.1.4",      // or use native zstd binary
    "protobufjs": "^7.2.0",       // protobuf parsing
    "md5-file": "^5.0.0"          // file checksums
  }
}
```

---

## Implementation Strategy for Nekomimi

### Phase 1: Basic Download
1. Implement manifest download + zstd decompression
2. Parse protobuf with protobufjs
3. Single-threaded chunk download (simpler to start)
4. File assembly with validation

### Phase 2: Optimization
1. Parallel chunk downloads with worker threads
2. Progress reporting via IPC
3. Resume interrupted downloads

### Phase 3: Advanced Features
1. Delta patching with hpatchz binary
2. Preload support (download patches before version switch)
3. Game repair functionality

---

## Manifest URLs (Where to get them)

Twintail uses a manifest repository system:

1. **Repository Manifest** - Lists available games
2. **Game Manifest** - Lists versions, download URLs, file info

Example structure:
```
manifests/
├── repository.json          # Lists all game manifests
└── games/
    ├── hk4e_global.json     # Genshin Impact
    ├── hkrpg_global.json    # Honkai Star Rail
    └── nap_global.json      # Zenless Zone Zero
```

The actual download URLs come from HoYoverse's CDN, fetched dynamically based on game version.

---

## Key Files from fischl-rs

| File | Purpose |
|------|---------|
| `src/download/game/hoyo.rs` | Sophon implementation (download, patch, repair, preload) |
| `src/download/game/mod.rs` | Trait definitions (Sophon, Kuro, Zipped) |
| `src/utils/proto.rs` | Protobuf message definitions |
| `src/utils/downloader.rs` | HTTP downloader with retry logic |
| `proto/SophonManifest.proto` | Protobuf schema for full download |
| `proto/SophonDiff.proto` | Protobuf schema for delta patch |

---

## References

- **fischl-rs**: https://github.com/TwintailTeam/fischl-rs
- **Twintail Launcher**: Local installation at `/home/jyq/.local/share/twintaillauncher/`
- **hpatchz**: https://github.com/sisong/HDiffPatch (for delta patching)
