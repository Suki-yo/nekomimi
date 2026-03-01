# Nekomimi

**The anime game launcher for people who simp too hard.**

---

## Overview
**Goal:** Unified game launcher for personal use - combines Lutris's flexibility with Twintail's game management for anime games.

**Motto:** One launcher to rule them all.

---

## Core Features

### 1. Game Library Management
- Manual game addition (point to executable)
- Auto-detect runner type (Wine/Proton/Native)
- Auto-detect wine prefix from executable path
- Game metadata (title, cover art, playtime, last played)
- Categories/tags

### 2. Game Launcher
- Wine/Proton execution with configurable env vars
- Pre-launch command support
- Post-launch command support
- MangoHud, gamemode, DXVK toggles
- Custom Wine/Proton path selection

### 2.5 Runner Management
- Scan system for installed Wine/Proton versions
- Fetch available versions from sources (Proton-GE GitHub, Wine builds)
- Download and install runners on user select
- Manage installed runners in `~/.config/nekomimi/runners/`
- Version tracking and updates for runners

### 3. Update Management (The Painpoint)
- **Game downloads** - Download from official sources or mirrors
- **Patch management** - Apply game patches (delta patches preferred)
- **Version tracking** - Know when updates are available
- **Manifest-based** - Like Twintail, use manifests to track files/versions
- Support initially for:
  - Genshin Impact
  - Honkai: Star Rail
  - Zenless Zone Zero
  - Wuthering Waves
  - (others as needed)

### 4. Mod Support
- Per-game mod toggle (vanilla vs modded launch)
- XXMI Loader integration (one install, per-game folders)
- Individual mod enable/disable via UI
- Mod list management (install, delete, toggle)
- Game detail modal for mod configuration

### 5. Linux-Specific Patches
- Anti-cheat workarounds per game
- Game-specific config edits (e.g., WuWa `Engine.ini`)
- SteamLinuxRuntime integration for Proton

---

## Technical Architecture

### Stack
| Component | Technology |
|-----------|------------|
| Frontend | React 19 + Tailwind CSS 4 |
| Backend | Electron (Node.js) |
| Database | SQLite |
| Config Format | YAML |

### Data Sources
```
~/.local/share/nekomimi/
├── library.db          # SQLite - game library, metadata, playtime
├── games/              # Per-game configs (YAML)
│   ├── genshin-impact.yml
│   └── wuthering-waves.yml
├── runners/            # Wine/Proton installations (bundled/downloaded)
│   └── dwproton-10.0-14/
├── xxmi/               # XXMI Launcher + importers (bundled/downloaded)
│   ├── Launcher/       # XXMI Launcher application
│   ├── EFMI/           # Endfield Model Importer
│   ├── GIMI/           # Genshin Model Importer
│   └── ...
├── cache/              # Downloaded patches, temporary files
└── config/             # App configuration
    └── settings.yml
```

### Key Modules
```
src/
├── main/                    # Electron main process
│   ├── index.ts
│   ├── ipc/                 # IPC handlers (one file per domain)
│   │   ├── config.handler.ts
│   │   ├── games.handler.ts
│   │   ├── lutris.handler.ts
│   │   └── index.ts         # Registers all handlers
│   └── services/
│       ├── game-launcher.ts     # Execute games
│       ├── update-manager.ts    # Download/patch games
│       ├── lutris-import.ts     # Read Lutris DB
│       └── mod-manager.ts       # XXMI, FPS unlocker
├── preload/                 # Security bridge, exposes window.api
├── shared/types/            # Types used by both main and renderer
│   ├── game.ts
│   ├── config.ts
│   ├── ipc.ts               # IPC channel contracts
│   └── index.ts
└── renderer/                # Frontend
    └── src/
        ├── api/             # IPC wrapper (SDK-style)
        │   ├── games.ts     # game:list, game:add, etc.
        │   ├── config.ts    # config:get, config:update
        │   └── lutris.ts    # lutris:import
        ├── components/
        ├── pages/
        │   ├── Library.tsx
        │   ├── GameDetail.tsx
        │   └── Settings.tsx
        └── hooks/
```

### IPC Architecture

**Main process:** One handler file per domain, each registers multiple channels.
```typescript
// main/ipc/games.handler.ts
export function registerGamesHandlers() {
  ipcMain.handle('game:list', () => { ... })
  ipcMain.handle('game:get', (_, id) => { ... })
  ipcMain.handle('game:add', (_, game) => { ... })
  // etc.
}
```

**Renderer:** API wrapper provides clean interface, hides IPC details.
```typescript
// renderer/src/api/games.ts
export async function getGames() {
  return window.api.invoke('game:list')
}
export async function addGame(game) {
  return window.api.invoke('game:add', game)
}

// Usage in components
import { getGames, addGame } from '../api/games'
const games = await getGames()
```

**Type safety:** `shared/types/ipc.ts` defines the contract for all channels.

---

## Game Config Schema (Draft)

```yaml
# Example: genshin-impact.yml
id: uuid-here
name: Genshin Impact
slug: genshin-impact
year: 2020

installed: true
directory: /home/jyq/Games/Genshin Impact
executable: Genshin Impact Game/GenshinImpact.exe

runner:
  type: proton  # wine | proton | native
  path: /home/jyq/.steam/steam/compatibilitytools.d/dwproton-10.0-14-x86_64-signed
  prefix: /home/jyq/Games/Genshin Impact/prefix

launch:
  env:
    WINEARCH: win64
    WINEDLLOVERRIDES: "dxgi=n"
  pre_launch: []
  post_launch: []
  args: ""

mods:
  enabled: true          # Global mod toggle for this game
  importer: "GIMI"       # Which XXMI importer (GIMI/SRMI/EFMI/WWMI/ZZMI/HIMI)
  # Legacy xxmi.path optional - auto-detected from importer
  fps_unlock:
    enabled: true
    fps: 120

update:
  source: official
  current_version: "4.8.0"
  channel: stable

playtime: 123.45  # hours
last_played: 2025-02-16T10:30:00Z
```

---

## Roadmap

### Phase 1 - MVP ✅ COMPLETE
- [x] Display game library with basic UI
- [x] Add game manually (auto-detect runner/prefix)
- [x] Launch games with Wine/Proton
- [x] Basic env var configuration
- [x] Playtime tracking
- [ ] Cover art display

### Phase 2 - Update Management
- [ ] Game manifest system (track installed files)
- [ ] Download game files
- [ ] Apply patches
- [ ] Version checking
- [ ] Start with ONE game (Genshin or WuWa)
- [ ] Runner management (scan, list, download Proton-GE/Wine versions)

### Phase 3 - Mod Integration ✅ COMPLETE
- [x] XXMI Loader integration (bundled, single install)
- [x] FPS Unlocker integration
- [x] Mod toggles in UI
- [x] Per-game mod enable/disable
- [x] Individual mod list with toggles
- [x] Game config modal with tabs (General | Mods)
- [x] Auto-save on change (no Save/Cancel buttons)
- [x] Play/Config buttons on game cards
- [x] Custom mod names (double-click to rename)
- [ ] Drag-drop mod installation
- [ ] Mod metadata (author, version, previews)

### Phase 4 - Polish
- [ ] Game-specific patch logic
- [ ] SteamLinuxRuntime integration
- [ ] Settings page
- [ ] Cover art support
- [ ] Categories/tags

---

## Open Questions

1. **Game manifests** - Use Twintail's manifest format or create own?
2. **Download sources** - Official servers only, or mirrors?
3. **Proton vs Wine** - Default to Proton (SteamLinuxRuntime) or pure Wine?
4. **XXMI versioning** - Handle XXMI updates too?
5. ~~**Multi-game mod support** - One XXMI install for all games, or per-game?~~ ✅ **RESOLVED**: One shared XXMI install with per-game importer folders
6. **Cover images** - Store as files? Base64 in YAML? Separate asset folder?
7. **Mod metadata** - Parse from mod folders? Community API? (EFMI/, GIMI/, etc.)

---

## Reference

| Project | What to borrow |
|---------|---------------|
| Lutris | DB schema, YAML config format, runner abstraction |
| Twintail | Update logic, game manifests, patching, XXMI integration |
| Steam | Library UI patterns |

---

*nyaa~*
