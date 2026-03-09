# Nekomimi - Claude Reference

Anime game launcher for Linux. Electron + React 19 + Tailwind CSS 4 + SQLite.

## Dev Commands

```bash
npm run dev          # Start both renderer (Vite :5173) and main (tsc + electron)
npm run dev:renderer # Vite only
npm run dev:main     # tsc + electron only
npm run build        # Production build
npm run rebuild      # Rebuild native modules (better-sqlite3) after electron upgrade
```

## Project Layout

```
src/
  main/
    index.ts                  # App entry, window setup, local:// protocol
    ipc/
      index.ts                # Registers all handlers
      games.handler.ts        # game:* channels
      download.handler.ts     # download:* channels
      mods.handler.ts         # mods:* channels
      config.handler.ts       # config:* channels
      dialog.handler.ts       # dialog:* channels
      image.handler.ts        # image:* channels
    services/
      database.ts             # better-sqlite3 (sync API), games/tags tables
      config.ts               # YAML game configs (load/save)
      paths.ts                # Path resolution (dev: ./dev-data, prod: ~/.local/share/nekomimi)
      game-launcher.ts        # Wine/Proton process management, playtime tracking
      game-detector.ts        # Auto-detect runner/prefix from exe path
      mod-manager.ts          # XXMI mod toggle (DISABLED_ prefix convention)
      download.ts             # Sophon/zip download orchestration
  preload/
    index.ts                  # contextBridge: exposes window.api.invoke/on/openFile/openImage
  shared/
    types/
      game.ts                 # Game, RunnerConfig, LaunchConfig, ModConfig, Mod
      ipc.ts                  # IPCChannels - the full type contract for all channels
      config.ts               # AppConfig
      download.ts             # HoyoVersionInfo, DownloadProgress, HoyoGameBiz
    constants.ts              # APP_NAME, DEFAULT_CONFIG, RUNNER_SOURCES (no Node APIs)
  renderer/src/
    App.tsx                   # Layout: sidebar nav + routes (/ = Library, /settings)
    pages/Library.tsx
    pages/Settings.tsx
    components/
      GameConfigModal.tsx     # Tabbed config: General | Mods, auto-save on change
      GameInstallModal.tsx    # Download flow for HoYoverse games
      DownloadModal.tsx
      CoverImage.tsx          # Uses local:// protocol for file images
```

## IPC Pattern

**Add a new channel:**
1. Define request/response in `src/shared/types/ipc.ts` → `IPCChannels`
2. Implement `ipcMain.handle('channel:name', ...)` in the relevant `*.handler.ts`
3. Call via `window.api.invoke('channel:name', request)` in renderer

**Push events from main → renderer:**
```ts
win?.webContents.send('download:progress', progress)  // main side
window.api.on('download:progress', (data) => ...)      // renderer side
```

## Data Storage

- **SQLite** (`library.db`): game index (id, name, slug, config_path, cover_path, playtime)
- **YAML** (`games/<slug>.yml`): full game config (runner, launch, mods, update)
- Game data = SQLite row + YAML config merged at read time
- Dev data lives in `./dev-data/` (gitignored), prod in `~/.local/share/nekomimi/`

## Key Conventions

- `shared/constants.ts` must not import Node.js APIs (used in renderer too)
- `src/main/services/paths.ts` is main-process only
- Cover images served via custom `local://` protocol (registered in main/index.ts)
- Mods enabled/disabled by renaming folder: `DISABLED_ModName` = disabled
- Mod custom names stored as `(CustomName)OriginalName` folder suffix
- SQLite uses `better-sqlite3` (synchronous) — no async/await for DB calls
- `initPaths()` → `initDatabase()` → `loadAppConfig()` → `registerAllHandlers()` boot order

## Game Download (Sophon)

HoYoverse games use chunk-based Sophon download:
- Fetch manifest URL → decompress (zstd) → parse protobuf → download chunks in parallel
- Each chunk: download → MD5 validate → zstd decompress → write at offset
- Delta patches use hdiff (`hpatchz` binary)
- `biz` values: `'genshin'` | `'starrail'` | `'zzz'`
- See `docs/sophon-research.md` for full protobuf schemas

## Current Status (as of feat/sophon-game-downloader)

- Phase 1 MVP: mostly done (cover art display partially broken)
- Phase 2 Download: in progress — sophon downloader being built
- Phase 3 Mods: complete
- Phase 4 Polish: pending
