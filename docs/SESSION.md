# Nekomimi - Session Log

## Sessions

---

### 2026-02-28 (Session 12) - Cover Image Display Attempts (UNRESOLVED)

#### Achievement
**Cover image selection working, but image display still failing.**

#### Problem Statement
Cover images can be selected and stored, but the `<img>` tag fails to render them. Multiple approaches tried, all result in `onError` or blank display.

#### What We Tried

**1. Base64 Data URL (Initial Approach)**
- Read file in main process
- Convert to base64
- Return as `data:image/png;base64,...`
- Result: `onError` fired, image not displayed
- Large images (4MB → 5.2MB base64) caused issues

**2. Blob URL Approach**
- Read file as buffer
- Create `Blob` in renderer
- Use `URL.createObjectURL()`
- Result: URL created but revoked too early, image never rendered

**3. Custom `img://` Protocol with `protocol.handle()`**
- Registered privileged scheme before app ready
- Handler read file and returned `Response` with data
- Result: Protocol handler never invoked (`[img protocol]` logs never appeared)

**4. `file://` URL Directly**
- Returned `file:///path/to/image.jpg` from IPC
- Result: Blocked by CORS (file:// from http://localhost:5173)

**5. Custom `local://` Protocol with `net.fetch()`**
- Used `net.fetch('file://...')` in protocol handler
- Result: `net::ERR_FAILED`

**6. Custom `local://` Protocol with Direct File Read**
- Read file with `fs.readFileSync()`
- Return `Response` with proper MIME type
- URL-encode the path: `local://%2Fhome%2F...`
- Result: Still getting `net::ERR_FAILED` (may be cached old code)

#### Current Code State

**Main Process (`src/main/index.ts`):**
```typescript
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
]);

// In createWindow():
protocol.handle('local', (request) => {
  const filePath = decodeURIComponent(request.url.slice(8))
  const data = fs.readFileSync(filePath)
  const mimeType = /* MIME type from extension */
  return new Response(data, {
    headers: { 'Content-Type': mimeType },
  })
})
```

**IPC Handler (`src/main/ipc/image.handler.ts`):**
```typescript
ipcMain.handle('image:read', async (_event, { imagePath }) => {
  const encodedPath = encodeURIComponent(imagePath)
  return `local://${encodedPath}`
})
```

**Renderer (`src/renderer/src/pages/Library.tsx`):**
```typescript
const CoverImage = ({ imagePath, alt }) => {
  const [src, setSrc] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.invoke('image:read', { imagePath })
      .then((url) => setSrc(url))
      .catch((err) => setError(String(err)))
  }, [imagePath])

  return (
    <img
      src={src!}
      alt={alt}
      onLoad={() => setLoaded(true)}
      onError={(e) => setError('Failed to load')}
    />
  )
}
```

#### Debugging Findings

- IPC handler is called successfully
- `local://` URLs are generated correctly
- Protocol handler logs `[local protocol] Loading:` never appear
- `onError` fires on img tag
- No `[CoverImage] onLoad fired` logs
- Console shows `net::ERR_FAILED` (even after removing `net.fetch()`)

#### Possible Issues

1. **Hot reload not updating main process** - Electron main process changes require full restart
2. **Protocol not registered in time** - `registerSchemesAsPrivileged` called before `app.ready()` but maybe still too late
3. **Renderer caching failures** - Browser might be caching failed loads
4. **URL encoding issues** - Special characters in paths (spaces in "Screenshot from 2026-02-09 19-20-43.png")
5. **CSP blocking** - Content Security Policy might be blocking custom protocols

#### Files Modified

- `src/main/index.ts` - Added protocol registration and handler
- `src/main/ipc/image.handler.ts` - Multiple iterations (base64 → file:// → img:// → local://)
- `src/renderer/src/pages/Library.tsx` - CoverImage component with debug states
- `src/renderer/src/components/GameConfigModal.tsx` - Same CoverImage component
- `src/shared/types/ipc.ts` - Updated image:read response type

#### Next Steps (To Resolve)

1. **Fully restart Electron** - Stop all processes and clean start
2. **Check CSP** - Add `<meta http-equiv="Content-Security-Policy" content="img-src local: *">` to index.html
3. **Try simpler protocol** - Use `protocol.registerFileProtocol` (deprecated but stable)
4. **Use preload script** - Load image in preload, pass data URL to renderer
5. **Downgrade Electron** - Try older Electron version if regression
6. **Use different approach** - NativeImage in preload → PNG to buffer → send to renderer
7. **Check for Electron issues** - Search for similar problems with `protocol.handle()` in dev mode

#### References
- Electron docs: https://www.electronjs.org/docs/latest/tutorial/quick-start
- protocol.handle(): https://www.electronjs.org/docs/latest/api/protocol
- Content Security Policy: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP

---

### 2026-02-28 (Session 10) - UI/UX Redesign + Mod Rename Feature

#### Achievement
**Complete UI/UX redesign with Play/Config buttons, tabbed config modal, auto-save, and custom mod names!**

#### What We Built

**1. Game Card Redesign**
- Removed click-to-open behavior on cards
- Added dedicated **Play** button (launches game)
- Added dedicated **Config** button (opens settings modal)
- Play button shows "Running" state when game is active
- Badges (Running, Mods) stacked at top-left

**2. GameConfigModal Component**
- Created new modal component with **tabs** (General | Mods)
- **Auto-save on every change** - no Save/Cancel buttons
- Clean tab switcher with icons
- Responsive modal with max-height scrolling

**3. General Tab**
- Cover image placeholder (not yet functional)
- Game name input (auto-saves on change)
- Runner dropdown (auto-saves)
- Read-only info: playtime, last played, directory

**4. Mods Tab** (moved from old detail dialog)
- Mod support toggle
- Individual mod list with enable/disable toggles
- Enable All / Disable All buttons
- **Double-click mod name to rename**

**5. Mod Rename Feature**
- Double-click mod name → inline edit
- Folder format: `(CUSTOMNAME)originalname`
- If custom name empty, removes custom prefix
- App displays only `CUSTOMNAME`
- Original name preserved in folder structure

**6. Toggle Switch Styling**
- Gray bar when off, **purple bar** when on
- White circle with **matching border** (gray/purple)
- Proper circle sizing for different toggle sizes
- Proper vertical centering

#### Files Created/Modified

**Created:**
- `src/renderer/src/components/GameConfigModal.tsx` - New config modal with tabs

**Modified:**
- `src/shared/types/game.ts` - Added `originalName` to `Mod` interface
- `src/shared/types/ipc.ts` - Added `mods:rename` channel
- `src/main/services/mod-manager.ts` - Added `parseModFolderName()`, `renameMod()`
- `src/main/ipc/mods.handler.ts` - Added `mods:rename` handler
- `src/renderer/src/pages/Library.tsx` - Complete UI redesign with Play/Config buttons
- `src/main/index.ts` - Removed menu bar (`mainWindow.setMenu(null)`)

#### Mod Rename Technical Details

**Folder naming:**
- No custom name: `original_folder_name/`
- With custom name: `(My Custom Name)original_folder_name/`
- Disabled: `DISABLED_(My Custom Name)original_folder_name/`

**Parsing logic:**
```typescript
// Extracts custom name from (CUSTOM)original format
const match = folderName.match(/^\((.+)\)(.+)$/)
if (match) {
  displayName: match[1],  // CUSTOM
  originalName: match[2], // original_folder_name
}
```

#### Toggle Switch Specs

**Large toggle (Mod Support):**
- Frame: 44px × 24px (`w-11 h-6`)
- Circle: 20px × 20px (`w-5 h-5`)
- Slide distance: 16px (`translate-x-4`)
- Top offset: 2px for centering (`top-0.5`)

**Small toggle (Individual mods):**
- Frame: 36px × 20px (`w-9 h-5`)
- Circle: 16px × 16px (`w-4 h-4`)
- Slide distance: 16px (`translate-x-4`)
- Top offset: 2px for centering (`top-0.5`)

#### UI Flow

**Library View:**
```
┌─────────────────────────┐
│   [Game Cover Image]     │
│   [Running] [Mods]       │
├─────────────────────────┤
│ Game Name                │
│ [▶ Play] [⚙ Config]     │
└─────────────────────────┘
```

**Config Modal:**
```
┌─────────────────────────────┐
│ Game Name              [✕]  │
├─────────────────────────────┤
│ [General]  [Mods]            │
├─────────────────────────────┤
│ (tab content...)             │
│ (all changes auto-save)      │
└─────────────────────────────┘
```

#### Key UX Principles Applied

1. **No modals for modals** - Direct actions, no extra confirmation steps
2. **Auto-save** - Changes apply immediately, visual feedback confirms
3. **Clear affordances** - Play and Config are distinct, primary/secondary actions
4. **Progressive disclosure** - Click Config to see options, not everything upfront
5. **Undo is easy** - Toggle back to revert changes

---

### 2026-02-28 (Session 11) - Cover Image Support

#### Achievement
**Cover image support with smart folder traversal for image selection!**

#### What We Built

**1. Cover Image Storage**
- Added `coverImage?: string` field to `Game` type
- Stores full path to image file
- Images displayed on game cards and in config modal

**2. Smart Image Dialog**
- `dialog:openImage` IPC channel with `defaultPath` option
- Traverses up/down file tree looking for pictures folders
- Searches for: `pictures`, `Images`, `photos`, `Wallpapers` folders
- Falls back to provided default path or home directory
- Filters: `jpg`, `jpeg`, `png`, `webp`, `gif`, `bmp`

**3. Folder Traversal Logic**
```typescript
function findPicturesFolder(startDir: string): string | null {
  // Traverse up (max 10 levels)
  // Check each directory for pictures subfolder
  // Traverse down 1 level if not found up
  // Return first match or null
}
```

**4. UI Updates**
- Game cards: Show cover image or placeholder icon
- Config modal: Display current image, "Change Image" button
- Images loaded via `file://` protocol

#### Files Modified

- `src/shared/types/game.ts` - Added `coverImage?: string`
- `src/shared/types/ipc.ts` - Added `dialog:openImage` channel
- `src/main/ipc/dialog.handler.ts` - Added `findPicturesFolder()`, `dialog:openImage` handler
- `src/preload/index.ts` - Exposed `openImage(defaultPath?)`
- `src/renderer/src/types/window.d.ts` - Added `openImage` to API type
- `src/renderer/src/components/GameConfigModal.tsx` - Image selection and display
- `src/renderer/src/pages/Library.tsx` - Display cover on game cards

---

### 2026-02-28 (Session 9) - Mod Management UX + Process Tracking Fix

#### Achievement
**Complete mod management system with UI, proper process tracking, and cleaned up UX!**

#### What We Built

**1. Mod Management System**
- Per-game mod toggle (global on/off)
- Individual mod enable/disable via UI
- In-game detail modal for managing mods
- Visual mod indicator badges on game cards

**2. Process Tracking Overhaul**
- Fixed stale entry problem - games no longer show as "running" when they're not
- Now tracks actual game executable (e.g., `Endfield.exe`), not just launcher
- Active polling with `pgrep` every 5 seconds to verify game is actually running
- Automatic cleanup of dead processes

**3. UX Polish**
- Removed Electron menu bar (File, Edit, View, etc.)
- Fixed overlapping badges on game cards (now stacked vertically)
- Game detail modal shows game info + mod settings

#### Files Created/Modified

**Type Definitions:**
- `src/shared/types/game.ts` - Added `Mod` interface, extended `ModConfig` with `enabled`, `importer`
- `src/shared/types/ipc.ts` - Added mod management channels
- `src/renderer/src/utils/mods.ts` - New utility for mod detection

**Backend Services:**
- `src/main/services/mod-manager.ts` - Added:
  - `getMods(importer)` - Scan Mods folder, return list with enabled state
  - `toggleMod(modPath, enabled)` - Rename with/without DISABLED_ prefix
  - `installMod(importer, zipPath)` - Extract zip to Mods folder
  - `deleteMod(modPath)` - Remove mod folder
  - `enableAllMods()`, `disableAllMods()` - Bulk operations

- `src/main/services/game-launcher.ts` - Complete tracking rewrite:
  ```typescript
  interface RunningGame {
    exeName: string         // Game executable name
    launcherPid?: number    // Launcher PID (for cleanup)
    startTime: number
    lastCheck: number       // Last verification time
  }

  // Poll every 5 seconds to verify processes are actually running
  function isProcessRunning(exeName: string): boolean {
    // Uses pgrep -f "Endfield.exe" to verify
  }
  ```

**IPC Handlers:**
- `src/main/ipc/mods.handler.ts` - Added handlers:
  - `mods:list` - Get mods for a game
  - `mods:toggle` - Toggle individual mod
  - `mods:install` - Install from zip
  - `mods:delete` - Delete mod
  - `mods:enable-all`, `mods:disable-all` - Bulk operations

**Frontend:**
- `src/renderer/src/pages/Library.tsx` - Major updates:
  - Game cards now show mod badge (purple "Mods" indicator)
  - Click on card opens detail modal
  - Detail modal shows mod support toggle + individual mod list
  - Badges stacked vertically (no more overlap)

**Main Process:**
- `src/main/index.ts` - Removed menu bar:
  ```typescript
  mainWindow.setMenu(null)  // Goodbye File/Edit/View
  ```

#### Game Config Schema Update

```yaml
mods:
  enabled: false           # NEW: Global mod toggle
  importer: "EFMI"         # NEW: Which XXMI importer
  # Legacy xxmi.path still supported but optional
```

#### Mod States

XXMI's `d3dx.ini` uses:
```ini
include_recursive = Mods
exclude_recursive = DISABLED*
```

Our implementation:
- **Active mod**: `modname/` folder
- **Disabled mod**: `DISABLED_modname/` folder (rename to toggle)
- **Install**: Extract `.zip` to Mods folder

#### Process Tracking Details

**Before:**
- Tracked launcher process only
- Stale entries persisted if launch failed
- XXMI launches stored `null` - couldn't verify status

**After:**
- Tracks actual game exe name (`Endfield.exe`)
- Polls every 5s with `pgrep -f "Endfield.exe"`
- Auto-cleans dead entries
- Works for both XXMI and normal launches

#### UI Flow

1. **Library View** - Game cards show:
   - Green "Running" badge (if game is running)
   - Purple "Mods" badge (if mods enabled)
   - Badges stacked at top-left

2. **Click Game Card** → Opens detail modal:
   - Game info (playtime, last played)
   - Mod Support toggle (if game supports XXMI)
   - List of installed mods with individual toggles
   - Active mod count

3. **Launch**:
   - If mods enabled → XXMI mode
   - If mods disabled → Vanilla launch
   - Process tracked by exe name, not launcher

#### XXMI Architecture (Shared)

One XXMI install, per-game folders:
```
dev-data/xxmi/
├── Resources/Bin/XXMI Launcher.exe  # Shared launcher
├── EFMI/Mods/                         # Endfield mods
├── GIMI/Mods/                         # Genshin mods
├── SRMI/Mods/                         # Star Rail mods
└── XXMI Launcher Config.json          # Central config
```

#### Next Steps
- [ ] Drag-drop mod installation (UI)
- [ ] Mod metadata parsing (author, version, preview images)
- [ ] Mod profile system (save/load mod configurations)
- [ ] In-app mod browser (future)

---

### 2026-02-27 (Session 8) - Bundled XXMI: SUCCESS!

#### Achievement
**Mods fully working with bundled XXMI and Proton runners!** No more external dependencies.

#### The Problem
Two competing modes were running simultaneously:
1. **Hook mode**: Nekomimi deployed d3d11.dll to game folder → Wine loads it automatically
2. **Inject mode**: XXMI Launcher injected d3d11.dll from EFMI folder via WriteProcessMemory
3. **Result**: Two DLLs loaded → d3dx.ini conflict → crash

#### The Fix
**Stopped deploying files to game folder for EFMI** - let XXMI handle everything via Inject mode.

Changed in `src/main/services/mod-manager.ts`:
```typescript
// Removed deployImporterToGame() call for EFMI
// XXMI uses Inject mode for anti-cheat games, files stay in EFMI folder only

// Also don't force Hook mode for EFMI:
if (importer !== 'EFMI' && importerConfig.custom_launch_inject_mode !== 'Hook') {
  importerConfig.custom_launch_inject_mode = 'Hook'
  needsSave = true
}
```

Also removed conflicting files from game directory:
```bash
rm ".../EndField Game/d3d11.dll"
rm ".../EndField Game/d3dx.ini"
```

#### Final Working Setup
- **Bundled XXMI**: `/dev-data/xxmi/`
- **Bundled Proton**: `/dev-data/runners/GE-Proton10-32/`
- **EFMI config**: `/dev-data/xxmi/EFMI/` (d3d11.dll, d3dx.ini, Mods/)
- **Game folder**: Clean, no XXMI files
- **Launch method**: `XXMI Launcher.exe --nogui --xxmi EFMI` via Proton's wine

#### Key Settings (dev-data/xxmi/EFMI/d3dx.ini)
```ini
require_admin = false
dll_initialization_delay = 500
```

#### Files Modified
- `src/main/services/mod-manager.ts` - Removed game folder deployment for EFMI
- `dev-data/xxmi/EFMI/d3dx.ini` - Matched working Lutris config

#### Technical Notes
- **Hook mode** (non-anti-cheat): Place d3d11.dll in game folder, Wine loads it
- **Inject mode** (anti-cheat/EFMI): XXMI injects via WriteProcessMemory, DLL stays in EFMI folder
- XXMI Launcher automatically uses Inject mode for EFMI regardless of config
- Process is: XXMI → Shell method → spawn game → inject d3d11.dll → 3DMigoto loads

#### Next Steps
- Clean up unused functions (`deployImporterToGame`, `isImporterDeployedToGame`)
- Test with other games (Genshin/Star Rail use Hook mode)
- Consider auto-cleanup of game folder files on launch

---

### 2026-02-27 (Session 8) - Bundled XXMI: Injection Works, Config Conflict

#### Progress
**Bundled XXMI and Proton runners directly into Nekomimi** - no longer relying on external Lutris/Twintail installations. This containerizes our app dependencies.

#### Current Status
- **Injection is working!** - 3DMigoto menu appears (F11 toggle visible)
- Mods are being loaded
- Game crashes with two errors:
  1. `d3dx.ini conflict error`
  2. `Unknown error (d3d11.dll)` ← crash point

#### What Changed
- Moved from symlinking to Lutris XXMI installation → bundled XXMI in Nekomimi
- Bundled Proton runners in project instead of using system Steam Proton
- Self-contained dependency model

#### The Problem
The d3dx.ini conflict suggests either:
1. Multiple d3dx.ini files being loaded (our bundled + game's existing one)
2. Conflicting directives between our config and game's config
3. Path issues in d3dx.ini pointing to wrong locations

The d3d11.dll error after the config conflict indicates 3DMigoto fails to initialize properly due to the config issue.

#### Key Files
- Our bundled XXMI: likely in `dev-data/xxmi/` or similar
- d3dx.ini configuration
- 3dmloader.exe and DLLs

#### Next Steps
1. Check d3dx.ini for conflicting includes/paths
2. Ensure only one d3dx.ini is being loaded
3. Verify all paths in d3dx.ini point to our bundled locations
4. Check if game directory has its own d3dx.ini we're conflicting with
5. Compare our bundled d3dx.ini with the working Lutris version

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
