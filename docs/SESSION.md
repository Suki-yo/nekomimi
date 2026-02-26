# Nekomimi - Session Log

## Sessions

---

### 2025-02-18 (Session 4)

#### What We Did

1. **Explored Lutris implementation**
   - Examined `pga.db` schema (games, categories, service_games, sources)
   - Looked at Lutris YAML config structure
   - Decided: don't need Lutris import - should scan games directly

2. **Created Lutris import (then deleted)**
   - Built `src/main/services/lutris-import.ts` (DB reader, YAML reader, converter)
   - Created `src/main/ipc/lutris.handler.ts`
   - Added `ImportedGame` type
   - Realized this is unnecessary bloat - deleted all files

3. **Created game detection service**
   - `src/main/services/game-detector.ts` - Auto-detect game info from executable path
   - `detectGame(exePath)` - returns name, executable, directory, prefix
   - `detectPrefix()` - walks up directories to find wine prefix (looks for drive_c + dosdevices)
   - `detectRunners()` - scans Steam compatibilitytools.d, system Wine, our runners dir

4. **Added file dialog support**
   - `src/main/ipc/dialog.handler.ts` - `dialog:openFile` handler
   - Updated `src/preload/index.ts` - exposed `window.api.openFile()`
   - Added `dialog:openFile` to IPC types

5. **Updated Library page with detection**
   - File picker button + folder icon
   - Auto-fill name, directory, prefix after selecting exe
   - Runner dropdown (uses `runner:list`)
   - Added prefix field to form
   - Used `DetectedRunner` and `DetectedGameInfo` types

6. **Successfully tested with Endfield**
   - File picker works
   - Detection returned name "Endfield"
   - Game saved to database: `dev-data/library.db`
   - YAML config created: `dev-data/games/endfield.yml`

#### Key Concepts Learned
- **Lutris architecture** - SQLite + YAML split, runner abstraction
- **Detection approach** - walk up from exe, look for wine prefix indicators
- **File picker in Electron** - use `dialog.showOpenDialog()` in main, expose via IPC
- **Incremental approval** - built code in small steps, user approved each chunk

#### Issues Found
1. **Prefix detection bug** - For Endfield, prefix saved as game directory instead of actual prefix (`/home/jyq/Games/Endfield/prefix/pfx`)
   - Detection logic should work but returned wrong value
   - Needs investigation in next session

2. **YAML path formatting** - Paths with spaces get split across lines oddly (but values are correct)

#### Files Changed
- Created: `src/main/services/game-detector.ts`
- Created: `src/main/ipc/dialog.handler.ts`
- Deleted: `src/main/services/lutris-import.ts`, `src/main/ipc/lutris.handler.ts`
- Updated: `src/main/ipc/index.ts` - registered dialog handler
- Updated: `src/preload/index.ts` - added openFile method
- Updated: `src/shared/types/ipc.ts` - added dialog:openFile, game:detect, runner:list
- Updated: `src/shared/types/game.ts` - added DetectedGameInfo, DetectedRunner; removed ImportedGame
- Updated: `src/shared/types/index.ts` - exported new types
- Updated: `src/main/ipc/games.handler.ts` - added game:detect and runner:list handlers
- Updated: `src/renderer/src/pages/Library.tsx` - file picker, detection, runner dropdown
- Updated: `src/renderer/src/types/window.d.ts` - added openFile to NekomimiAPI
- Updated: `src/main/services/database.ts` - added playtime to CreateGameInput

#### Next Steps
- Fix prefix detection bug (detecting wrong directory)
- Game launcher service (game-launcher.ts) - Actually launch games with Wine/Proton
- Game detail/edit page
- Cover art support

---

### 2025-02-18 (Session 3)

#### What We Did

1. **Completed backend services**
   - `src/main/services/config.ts` - Load/save YAML configs (app config + game configs)
   - Fixed database.ts to create directory before opening SQLite

2. **Created IPC handlers**
   - `src/main/ipc/config.handler.ts` - config:get, config:update
   - `src/main/ipc/games.handler.ts` - game:list, game:get, game:add, game:update, game:delete
   - `src/main/ipc/index.ts` - registers all handlers

3. **Electron entry point**
   - `src/main/index.ts` - main process, creates window, initializes services
   - `src/preload/index.ts` - security bridge, exposes window.api to renderer

4. **Frontend setup**
   - React 19 + Vite + React Router
   - Tailwind CSS 4 with @tailwindcss/vite plugin
   - shadcn/ui components (button, card, dialog, input, label)

5. **Implemented Library page**
   - Game grid display with cards
   - Add game dialog (name, directory, executable)
   - Delete game with confirmation
   - Connected to backend via IPC

6. **Created shadcn components**
   - Manually copied components (CLI didn't work with Electron)
   - Components: Button, Card, Dialog, Input, Label
   - Used Radix UI primitives + Tailwind CSS

#### Key Concepts Learned
- **shadcn/ui** = Not a package, just copy-pasteable components you own
- **Vite @tailwindcss/vite** = Required for Tailwind v4 to work with Vite
- **Radix UI** = Unstyled, accessible primitives for building components
- **Dialog z-index** = Content must be above overlay (z-[51] vs z-50)
- **e.stopPropagation()** = Prevent event bubbling when nested clickable elements

#### Issues Fixed
1. Database directory not created → Added `fs.mkdirSync(path.dirname(paths.library), { recursive: true })`
2. Tailwind not applying → Installed `@tailwindcss/vite` plugin
3. Dialog inputs not working → Removed animation classes, fixed z-index
4. Dialog closing on validation error → Added `onPointerDownOutside` handler, `type="button"`
5. Terminal output pasted into file → User accidentally pasted terminal output into main.tsx

#### Next Steps
- Game launcher service (game-launcher.ts) - Actually launch games with Wine/Proton
- Lutris import (lutris-import.ts) - Import existing Lutris games
- Game detail/edit page
- Cover art support

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
- **Prepared statements** = SQL compiled once, reused for performance + security

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
