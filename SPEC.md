# Nekomimi

**The anime game launcher for people who simp too hard.**

---

## Overview
**Goal:** Unified game launcher for personal use - combines Lutris's flexibility with Twintail's game management for anime games.

**Motto:** One launcher to rule them all.

---

## Core Features

### 1. Game Library Management
- Import existing Lutris games (read `pga.db` + YAML configs)
- Manual game addition (point to executable)
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
- XXMI Loader integration
- FPS Unlocker integration
- Mod enable/disable toggles
- Mod configuration UI

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
~/.config/nekomimi/
├── library.db          # SQLite - game library, metadata, playtime
├── games/              # Per-game configs (YAML)
│   ├── genshin-impact.yml
│   └── wuthering-waves.yml
├── runners/            # Wine/Proton installations
├── cache/              # Downloaded patches, temporary files
└── mods/               # XXMI, FPS unlocker, etc.
```

### Key Modules
```
src/
├── main/                    # Electron main process
│   ├── index.ts
│   ├── ipc/                 # IPC handlers
│   └── services/
│       ├── game-launcher.ts     # Execute games
│       ├── update-manager.ts    # Download/patch games
│       ├── lutris-import.ts     # Read Lutris DB
│       └── mod-manager.ts       # XXMI, FPS unlocker
├── preload/                 # Security bridge
└── frontend/
    └── src/
        ├── components/
        ├── pages/
        │   ├── Library.tsx
        │   ├── GameDetail.tsx
        │   └── Settings.tsx
        └── hooks/
```

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
  xxmi:
    enabled: true
    path: /home/jyq/Games/XXMI
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

### Phase 1 - MVP
- [ ] Read/import Lutris library
- [ ] Display game library with basic UI
- [ ] Launch games with Wine/Proton
- [ ] Basic env var configuration
- [ ] Add game manually
- [ ] Playtime tracking
- [ ] Cover art display

### Phase 2 - Update Management
- [ ] Game manifest system (track installed files)
- [ ] Download game files
- [ ] Apply patches
- [ ] Version checking
- [ ] Start with ONE game (Genshin or WuWa)
- [ ] Runner management (scan, list, download Proton-GE/Wine versions)

### Phase 3 - Mod Integration
- [ ] XXMI Loader integration
- [ ] FPS Unlocker integration
- [ ] Mod toggles in UI

### Phase 4 - Polish
- [ ] Game-specific patch logic
- [ ] SteamLinuxRuntime integration
- [ ] UI polish
- [ ] Settings page

---

## Open Questions

1. **Game manifests** - Use Twintail's manifest format or create own?
2. **Download sources** - Official servers only, or mirrors?
3. **Proton vs Wine** - Default to Proton (SteamLinuxRuntime) or pure Wine?
4. **XXMI versioning** - Handle XXMI updates too?
5. **Multi-game mod support** - One XXMI install for all games, or per-game?

---

## Reference

| Project | What to borrow |
|---------|---------------|
| Lutris | DB schema, YAML config format, runner abstraction |
| Twintail | Update logic, game manifests, patching, XXMI integration |
| Steam | Library UI patterns |

---

*nyaa~*
