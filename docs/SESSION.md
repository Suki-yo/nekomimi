# Nekomimi - Session Log

## Sessions

---

### 2026-02-26 (Session 7) - XXMI Mod Injection Success (Partial)

#### Achievement
**Successfully got 3DMigoto to inject into Endfield!**

```
[xxmi] 292: 3DMigoto loaded :)
[xxmi] 780: 3DMigoto loaded :)
```

The output shows 3DMigoto was successfully loaded into Endfield processes.

#### What Made It Work

After multiple attempts with different approaches, the final solution:

1. **Used Twintail's 3dmloader.exe** (27KB console app) from `/home/jyq/.local/share/twintaillauncher/extras/xxmi/`
2. **Set up EFMI folder structure** in Twintail's xxmi directory
3. **Copied real 3DMigoto DLLs** (not symlinks) from XXMI Launcher to EFMI folder
4. **Ran 3dmloader from inside efmi folder** (not root xxmi)
5. **Used WINEDLLOVERRIDES="d3d11=n"** to force native 3DMigoto DLL instead of Wine's
6. **Used game's Proton wine64 binary** to run 3dmloader

#### Final Working Command
```bash
WINEPREFIX=/home/jyq/Games/Endfield/prefix/pfx \
WINEARCH=win64 \
WINEDLLOVERRIDES="d3d11=n;lsteamclient=d;KRSDKExternal.exe=d" \
/home/jyq/.steam/steam/compatibilitytools.d/GE-Proton10-30/files/bin/wine64 "3dmloader.exe"
```
Run from: `/home/jyq/.local/share/twintaillauncher/extras/xxmi/efmi/`

#### EFMI Folder Structure
```
/home/jyq/.local/share/twintaillauncher/extras/xxmi/efmi/
├── 3dmloader.exe          # Copied from Twintail root
├── d3d11.dll              # Real 3DMigoto DLL (from XXMI Launcher)
├── d3dcompiler_47.dll     # Real 3DMigoto DLL
├── d3dx.ini               # 3DMigoto config
├── Core/EFMI/main.ini     # EFMI core configuration
├── Mods/                  # User mods (extracted, not zipped)
├── ShaderCache/
└── ShaderFixes/
```

#### Key Configuration Fixes

**d3dx.ini format** - Must use `key=value` (no spaces):
```ini
[Loader]
loader=XXMI Launcher.exe
require_admin=false
launch=C:\Program Files\GRYPHLINK\games\EndField Game\Endfield.exe
module=d3d11.dll
delay=20
target=Endfield.exe
[Include]
include_recursive=Mods
include=Core\EFMI\main.ini
exclude_recursive=DISABLED*
```

**Mod folders** - Some mods were still zipped (.zip, .7z), need to be extracted

#### Current Issue
Mods are being injected, but into the wrong Endfield instance. Multiple processes exist (PIDs 292, 780), and the playable window doesn't have mods active.

#### Files Created/Modified
- `src/main/services/mod-manager.ts` - Complete rewrite with Twintail approach
- `src/main/services/game-launcher.ts` - Added XXMI flow, improved process tracking
- Created EFMI folder in Twintail xxmi directory

#### Next Steps
1. Figure out why multiple Endfield processes are created
2. Ensure 3dmloader injects into the correct (playable) instance
3. Test with F11 to toggle mods once correct instance is injected
4. Consider making mod support configurable per game

---

### 2026-02-26 (Session 6) - XXMI Integration Attempt

#### What We Did

1. **Researched Twintail's XXMI implementation**
   - Analyzed `game_launch_manager.rs` for injection logic
   - Found Twintail uses `3dmloader.exe` (Hook mode) via Wine
   - XXMI Launcher supports both Hook and Inject modes

2. **Created mod-manager.ts**
   - `shouldUseXXMI()` - detects Endfield.exe (hardcoded)
   - `launchGameWithXXMI()` - attempts to launch with XXMI
   - Initially tried XXMI Launcher `--nogui` mode
   - Then tried Twintail's 3dmloader.exe approach

3. **Discovered fundamental blockers**
   - **Twintail's 3dmloader.exe**: Uses Hook mode, triggers anti-cheat detection → crash
   - **XXMI Launcher --nogui**: Starts game with plain Wine, not Proton → crash
   - **XXMI Launcher GUI**: Works! But only because both XXMI and game are in Lutris

4. **Key Finding: Lutris Environment**
   - XXMI works when both XXMI and the game are installed via Lutris
   - They share the same Wine prefix/environment (simulated Windows)
   - XXMI can inject because it's in the same Wine "world" as the game
   - Running XXMI separately (from Node.js) breaks this connection

#### Files Created/Modified
- Created: `src/main/services/mod-manager.ts`
- Modified: `src/main/services/game-launcher.ts` - added XXMI check
- Modified: `src/main/services/game-launcher.ts` - improved "already running" detection

#### Technical Details

**XXMI Injection Modes:**
- **Hook mode**: Places d3d11.dll in game folder as proxy (3dmloader.exe)
- **Inject mode**: Uses WriteProcessMemory for anti-cheat games (XXMI Launcher)

**Why Endfield needs Inject mode:**
- Has AntiCheatExpert
- Hook mode gets detected → crash

**Why --nogui fails:**
- XXMI starts game with `process_start_method: "Native"` (plain Wine)
- Endfield needs Proton/umu for anti-cheat
- GUI mode works because Lutris sets up proper environment

#### Next Steps (Future)
1. Research how to run XXMI within game's Proton environment
2. Consider building custom Proton-aware injector
3. Or accept XXMI as external tool (not integrated)

---

### 2026-02-25 (Session 5) - XXMI Research

#### What We Did

1. **Attempted XXMI integration** (later reverted)
   - Created mod-manager.ts, mods.handler.ts for XXMI mod support
   - Tried using 3dmloader.exe (from Twintail) for injection
   - Tried using XXMI Launcher's `--nogui` mode
   - All attempts failed - game crashed with d3d11.dll error
   - Reverted all changes to protect working Lutris setup

2. **Deep dive into XXMI Launcher internals**
   - Analyzed XXMI Launcher Config.json for EFMI settings
   - Examined d3dx.ini configuration structure
   - Read XXMI Launcher Log.txt to understand actual launch process

3. **Key discovery: XXMI uses two injection modes**
   - **Hook mode**: Standard DLL proxying (d3d11.dll in game folder)
   - **Inject mode**: Direct WriteProcessMemory injection (for anti-cheat games)
   - EFMI uses **Inject mode** because Endfield has AntiCheatExpert

#### XXMI Launch Process (Dissected)

From the XXMI Launcher log, the exact launch sequence for EFMI:

```
1. ApplicationEvents.Launch()
2. ModelImporterEvents.StartGame()
3. MigotoManagerEvents.StartAndInject(
     game_exe_path = Endfield.exe
     start_exe_path = Endfield.exe
     start_args = ['-force-d3d11']    ← DX11 mode required!
     work_dir = game directory
     use_hook = False                 ← Inject mode, not Hook!
   )
4. ApplicationEvents.Inject(library_name='d3d11.dll', process_name='Endfield.exe')
5. Starting game process using Native method:
     exe_path = Endfield.exe
     start_args = ['-force-d3d11']
     process_flags = 67108912
     dll_paths = [XXMI-Launcher/EFMI/d3d11.dll]
6. Successfully injected DLL to process Endfield.exe (PID: 408)
```

**Key parameters from config:**
- `custom_launch_inject_mode: "Inject"` (not "Hook")
- `xxmi_dll_init_delay: 500` (ms delay before injection)
- `process_timeout: 60` (seconds to wait for process)
- `process_start_method: "Native"` (not "Shell")

**EFMI d3dx.ini critical settings:**
```ini
[Loader]
target = Endfield.exe        ; Process to inject into
loader = XXMI Launcher.exe   ; The loader executable
module = d3d11.dll           ; DLL to inject
```

#### XXMI File Structure

```
XXMI-Launcher/
├── EFMI/                        # Endfield template
│   ├── Core/                    # Core EFMI config
│   │   └── EFMI/main.ini
│   ├── Mods/                    # User mods go here
│   ├── d3d11.dll                # 3DMigoto DLL
│   ├── d3dcompiler_47.dll       # Shader compiler
│   └── d3dx.ini                 # 3DMigoto config
├── Resources/
│   ├── Bin/
│   │   └── XXMI Launcher.exe    # Main launcher
│   └── Packages/
│       └── XXMI/
│           ├── 3dmloader.dll    # Note: .dll, not .exe
│           ├── d3d11.dll
│           └── d3dcompiler_47.dll
└── XXMI Launcher Config.json    # All settings
```

#### Twintail vs XXMI Launcher Approach

| Aspect | Twintail | XXMI Launcher |
|--------|----------|---------------|
| Loader | `3dmloader.exe` | `XXMI Launcher.exe` |
| Core DLLs | In xxmi root | In per-game folder |
| Templates | In xxmi root | In Launcher root |
| Injection | Hook mode | Hook or Inject mode |

Twintail uses `3dmloader.exe` which is a separate build (27KB console app).
XXMI Launcher has `3dmloader.dll` which is different (loaded by launcher).

#### Implementation Plan for Nekomimi

To implement XXMI-like injection without running XXMI Launcher:

1. **Package XXMI files in Nekomimi:**
   ```
   dev-data/xxmi/
   ├── core/
   │   ├── d3d11.dll
   │   └── d3dcompiler_47.dll
   └── templates/
       ├── efmi/ (d3dx.ini, Core/, Mods/)
       ├── gimi/
       ├── srmi/
       └── ...
   ```

2. **Implement DLL injection:**
   - Need a Windows injector executable (like 3dmloader.exe)
   - Must use WriteProcessMemory for anti-cheat games
   - Or find a way to call 3dmloader functions from Node.js

3. **Launch sequence for Endfield:**
   ```
   1. Start game.exe with -force-d3d11 arg
   2. Wait for process to start
   3. Inject d3d11.dll into process
   4. Wait for game to close
   ```

4. **Alternative: Use XXMI Launcher headless:**
   ```
   wine "XXMI Launcher.exe" --nogui --xxmi EFMI
   ```
   This runs XXMI Launcher in CLI mode, which handles everything.

#### GitHub Repositories
- Core: `SpectrumQT/XXMI-Libs-Package`
- GIMI: `SilentNightSound/GIMI-Package`
- SRMI: `SpectrumQT/SRMI-Package`
- WWMI: `SpectrumQT/WWMI-Package`
- ZZMI: `leotorrez/ZZMI-Package`
- EFMI: `wakka810/3dmigoto-arknights-endfield`

#### References
- Working XXMI setup: `/home/jyq/Games/XXMI-Launcher/`
- Twintail XXMI: `/home/jyq/.local/share/twintaillauncher/extras/xxmi/`
- Twintail source: `/home/jyq/twintaillauncher/src/TwintailLauncher-ttl-v1.1.15/src-tauri/src/utils/game_launch_manager.rs`

#### Next Steps
1. Research how 3dmloader.exe works (C++ source? Binary analysis?)
2. Consider using XXMI Launcher's `--nogui` mode as interim solution
3. Look into Node.js native modules for DLL injection
4. Test with simpler games first (Genshin/Star Rail use Hook mode)

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
