# Nekomimi - Session Log

## Sessions

---

### 2025-02-17 (Session 2)

#### What We Did

1. **Completed shared types**
   - `src/shared/types/config.ts` - AppConfig interface
   - `src/shared/types/ipc.ts` - IPC channel contracts (defines what data flows where)
   - `src/shared/types/index.ts` - Barrel exports for cleaner imports

2. **Created constants and paths**
   - `src/shared/constants.ts` - Static values (app name, defaults, URLs)
   - `src/main/services/paths.ts` - Dynamic path resolution (Node.js only)

3. **Set up build system**
   - Updated `package.json` with dependencies (electron, better-sqlite3, yaml)
   - Created `tsconfig.json` for TypeScript compilation
   - Added npm scripts (dev, build, rebuild)

4. **Designed database schema**
   - SQLite for core metadata (id, name, playtime, installed, cover_path)
   - YAML files for flexible per-game config (runner, launch, mods)
   - Tables: games, tags, game_tags

5. **Implemented database service**
   - `src/main/services/database.ts` - CRUD operations for games and tags

#### Key Concepts Learned
- **Barrel exports** (index.ts) = Re-exports types for cleaner imports
- **IPC channels** = Contract between frontend and backend (defines request/response shapes)
- **SQLite + YAML split** = SQLite for searchable data, YAML for flexible config
- **tsconfig.json** = Tells TypeScript how to compile (src/ → dist/)
- **constants vs paths** = Static values work everywhere, path resolution needs Node.js

#### Need to Review
- `database.ts` - Don't fully understand how the database service works yet. Need to revisit.

#### Next Steps
1. `src/main/services/config.ts` - Load/save YAML config
2. `src/main/ipc/*.ts` - Wire services to IPC channels
3. `src/main/index.ts` - Electron entry point

---

### 2025-02-17 (Session 1)

#### What We Did

1. **Created folder structure**
   ```
   src/
   ├── main/ipc/, main/services/
   ├── preload/
   ├── renderer/src/{components,hooks,pages}
   └── shared/types/
   ```

2. **Wrote foundation types**
   - `src/shared/types/game.ts` - Game interface + subtypes (RunnerConfig, LaunchConfig, ModConfig, UpdateConfig)
   - `src/shared/types/runner.ts` - Runner types (Wine, Proton, Native)

3. **Updated SPEC.md**
   - Added "2.5 Runner Management" section (download Proton-GE/Wine on user select)
   - Added runner management to Phase 2 roadmap

4. **Architecture walkthrough**
   - Explained folder responsibilities (main, preload, renderer, shared)
   - Explained Node access vs DOM access in Electron
   - Explained why IPC exists (security separation)

#### Key Concepts Learned
- **Interface** = TypeScript schema/structure for objects
- **YAML** = actual data that fills in the interface
- **Runner** = installed Wine/Proton on system
- **RunnerConfig** = how a specific game uses a runner
- **IPC** = communication bridge between main (Node) and renderer (browser)

#### Next Steps
1. `src/shared/types/ipc.ts` - IPC channel names
2. `src/shared/types/config.ts` - App config interface
3. `src/shared/types/index.ts` - Barrel exports
4. `src/shared/constants.ts` - App paths and constants
5. Then move to `src/main/` - database, logger, paths

---

### 2025-02-16 (Initial Session)

#### What We Did

1. **Fixed Wallpaper Selector Sync Service**
   - Problem: Matugen using cached wallpaper at startup
   - Fix: Changed systemd service `After=` to `Before=dms.service`

2. **Researched Existing Launchers**
   - Lutris: Python/GTK3, YAML + SQLite, no update management
   - Twintail: Tauri 2, anime games focus, has update management + XXMI

3. **Project Planning**
   - Created SPEC.md with features, architecture, roadmap
   - Named project "Nekomimi"

4. **Neovim Configuration**
   - Fixed file reload issues with autoread + autocmds

---

*nyaa~*
