# Wuthering Waves Mod Launch Issues

## Current Status (2026-03-08 Late)
- nekomimi now uses a nekomimi-local copy of Twintail's working WuWa runner and prefix instead of launching against `~/.local/share/twintaillauncher` directly
- nekomimi now treats WuWa as Steam app `3513350` / `umu-3513350` and writes `Client/Binaries/Win64/steam_appid.txt`
- nekomimi's WWMI Proton path now prefers direct `steamrt -> proton waitforexitandrun` instead of always going through `umu-run`
- nekomimi now forces WWMI `custom_launch_enabled = false`, clears `custom_launch_signature`, and split-launches WuWa itself after XXMI setup
- **Still broken:** WuWa still trips the false-positive ACE path under nekomimi
- **New concrete mismatch:** XXMI's WWMI custom launch is spawning `C:\\windows\\system32\\cmd.exe /C ...Client-Win64-Shipping.exe -dx11`, and that `cmd.exe` stays alive as the parent of the game process
- **Why this matters:** Twintail does not leave that hanging `cmd.exe` layer around, so XXMI custom launch is still not matching Twintail's working launch architecture

## Twintail Alignment Work Completed
- Copied Twintail's WuWa Proton runner `10.0-20260227-proton-cachyos` into nekomimi-local storage
- Copied Twintail's working WuWa prefix into nekomimi-local storage
- Rewired `dev-data/games/wuwa.yml` to the nekomimi-local runner/prefix copies
- Added migration code so old configs still pointing at Twintail can be imported into nekomimi-owned paths
- Restored WWMI to XXMI-launcher ownership mode (`loader = XXMI Launcher.exe`) instead of standalone `3dmloader.exe`
- Forced WuWa app identity to `3513350`/`umu-3513350`

## New Findings
- Twintail's manifest explicitly enables `steam_import_config` for WuWa:
  - `steam_appid_txt = Client/Binaries/Win64/steam_appid.txt`
  - `steam_api_dll = Client/Binaries/Win64/steam_api64.dll`
- nekomimi had no implementation for that manifest field before this debugging session
- Proton's built-in WuWa gamefix exists for app `3513350`, but Twintail's own manifest also sets `disable_protonfixes: true`
- When nekomimi switched WWMI onto the direct Proton path, Proton showed `Installing Game-Specific fixes, please wait...`
- That dialog comes from the runner's bundled `protonfixes` package, not from WuWa or XXMI
- Seeing that dialog means the launch still diverged from Twintail's intended WuWa behavior, because Twintail disables protonfixes for WuWa

## Most Recent Working/Failing Process Evidence
- Failing nekomimi WWMI process tree:
  - `XXMI Launcher.exe --nogui --xxmi WWMI`
  - `C:\\windows\\system32\\cmd.exe /C Z:\\home\\jyq\\Games\\WutheringWaves\\Client\\Binaries\\Win64\\Client-Win64-Shipping.exe -dx11`
  - `Client-Win64-Shipping.exe -dx11`
- The hanging `cmd.exe` strongly suggests XXMI `custom_launch` is the remaining runtime mismatch
- Current fix direction in code: keep XXMI for hook/setup only, then have nekomimi launch `Client-Win64-Shipping.exe -dx11` itself under the same Proton path after a short delay

## Current Status (INJECTION WORKS, XXMI CREATE MODE IS NOT USABLE)
- ✅ **SOLVED**: DLL injection now succeeds when WWMI is launched under the proper Proton environment
- ❌ **CONFIRMED NOT VIABLE**: XXMI `Create+Inject` is not supported by the current launcher build
- ⚠️ **CURRENT PATH**: nekomimi's WWMI flow uses a separate `3dmloader.exe` + game launch path instead of Twintail's app implementation
- **Root cause of injection failure**: XXMI was launched under bare wine64 (bundled GE-Proton) instead of proper Proton environment
- **Fix applied**: Detect Proton runner (`{runnerPath}/proton` exists) and launch XXMI via umu-run with `PROTONPATH=runnerPath` and `STEAM_COMPAT_CONFIG=noopwr,noxalia`
- **What the log proves**: XXMI 0.7.9 errors with `ValueError: Unknown process start method \`CREATE\`!`, so that setting cannot be the fix on this build

## D3D11 Swap Chain Crash — Root Cause Analysis (2026-03-08)

### Summary
- **Confirmed from game log**: `RHIThread` crash at `0xe06d7363` in `d3d11.dll`, 9 seconds after D3D11 device creation
- **Confirmed from XXMI log**: Injection succeeds at 15:51:40, game crashes at 15:51:56 (same session)
- **Most likely root cause**: XXMI Shell mode starts the game process RUNNING then injects the DLL. Some d3d11 state is initialized before XXMI's hook is active. XXMI 0.7.9 has a known bug with "existing invalid swap chain pointer" when hooking into already-running d3d11 state.
- **Rejected fix**: `process_start_method: Create` cannot be used here because XXMI 0.7.9 on Wine raises `Unknown process start method \`CREATE\``
- `xxmi_dll_init_delay` was still set to `0` during this test

### Important Implementation Mismatch
- This doc previously described nekomimi as testing XXMI `Create+Inject`, but `src/main/services/mod-manager.ts` currently does **not** launch WWMI that way.
- For WWMI on a Proton runner, nekomimi starts `3dmloader.exe` from the WWMI folder, then launches `Client-Win64-Shipping.exe` itself.
- That means Twintail's *architecture* is relevant as reference, even if we do not want to copy Twintail's application code.

### Additional Local Bug Found
- nekomimi's standalone WWMI path was launching the game without setting `cwd` to the game directory.
- Normal non-mod launches already use `cwd: game.directory`, so WWMI was inconsistent here.
- This was patched in `src/main/services/mod-manager.ts` on 2026-03-08.

### WuWa D3D11Bridge insight
The game log shows WuWa uses a custom `D3D11Bridge` module with `FD3D11DefaultFunctions` that loads d3d11 functions via `GetProcAddress` (not static import). This could interact poorly with XXMI's IAT hook approach in Shell mode.

## D3D11 Swap Chain Crash — Original Details (2026-03-08)

### Error Details
- **Exception**: `0xe06d7363` (C++ exception, unhandled)
- **Location**: RHIThread in d3d11.dll (XXMI's hook)
- **Stack depth**: 9 frames deep in d3d11.dll → WuWa game exe
- **Timing**: Occurs 2 seconds after engine initialization, during first render pass
- **Status**: DLL injection succeeds perfectly, but game crashes immediately after startup

### Investigation Notes
- XXMI 0.7.9 release notes mention: "Reverted problematic patch that attempted to fix swap chain creation failure due to existing invalid swap chain pointer"
- This is a pre-existing XXMI bug, yet Twintail works with identical XXMI 0.7.9 version
- Possible causes:
  1. Timing issue: game creates D3D11 device before XXMI's `dll_initialization_delay=500` expires
  2. DXVK version mismatch: Twintail's proton-cachyos might use different DXVK version
  3. XXMI config difference: Twintail's d3dx.ini or d3dx_user.ini has settings that work around the bug
  4. Launch args: Twintail might pass different args to Client-Win64-Shipping.exe
  5. Missing setting: Some XXMI/3DMigoto setting (in XXMI Launcher Config or d3dx.ini) that enables D3D11 workaround

### Next Steps to Try
- [ ] Compare Twintail's proton-cachyos version vs nekomimi's
- [ ] Check if Twintail uses a patched XXMI binary or custom d3dx.ini settings
- [ ] Try disabling mods (test vanilla WuWa launch) to confirm base game works
- [ ] Try XXMI's alternative launch modes: "Create" instead of "Shell"
- [ ] Check if custom launch args (`-noxalia` or others) help
- [ ] Investigate if this is a Wayland/X11 issue specific to our environment

## Debugging Session (2026-03-08)

### Bugs Fixed
1. ✅ WWMI now added to `Launcher.enabled_importers` after download
2. ✅ WWMI uses `custom_launch_inject_mode: 'Inject'` (not 'Hook')
3. ✅ WWMI config now properly persists in XXMI Launcher Config.json

### Approaches Tried (All Failed)

#### Approach 1: Pass executable path via --exe_path
- **Issue**: XXMI Launcher was auto-detecting `Wuthering Waves.exe` (launcher) instead of `Client-Win64-Shipping.exe` (game)
- **Solution**: Pass `--exe_path` parameter to XXMI with full Windows path
- **Result**: ❌ FAILED - Still got error 126 (permission denied for d3dcompiler_47.dll)
- **Hypothesis**: Parameter was ignored or XXMI doesn't support it in nogui mode

#### Approach 2: Symlinks to shared DLLs (Twintail style)
- **Observation**: Twintail's XXMI uses symlinks: `WWMI/d3d11.dll -> /shared/d3d11.dll`
- **Attempted Solution**:
  1. Extract XXMI-Libs-Package to XXMI root (shared location)
  2. Create symlinks in each importer folder
- **Result**: ❌ FAILED - Symlink code ran but symlinks were never created, DLLs remained as copies
- **Issue**: Extraction code silently failed, DLLs never appeared at root
- **Root Cause**: XXMI-Libs-Package zip has DLLs in subfolder, not at root; extraction logic failed

#### Approach 3: Copy DLLs from existing importer
- **Solution**: Copy d3d11.dll from EFMI to WWMI, or download fresh
- **Result**: ❌ FAILED - Same error 126 (permission denied for d3dcompiler_47.dll)
- **Status**: Reverted (commit 8a0f217)

## Launch Method for Non-HoYo Games (Working)
- **Current**: WuWa launches XXMI via direct wine (`runner.wine`) from bundled runner (GE-Proton)
- **Status**: Working correctly — XXMI handles Proton environment internally

## XXMI Launcher Config State (dev-data/xxmi/XXMI Launcher Config.json)
```
WWMI:
  game_folder: Z:/home/jyq/Games/WutheringWaves/Client/Binaries/Win64 (NOW SET)
  process_start_method: Shell (NOW SET)
  custom_launch_inject_mode: Hook (POSSIBLY WRONG)
active_importer: EFMI (last game launched was Endfield)
```

## Next Steps to Investigate

### Critical Issue: Error 126 (Permission Denied)
The actual error when XXMI tries to load d3dcompiler_47.dll is:
```
ValueError: Failed to load Z:\home\jyq\dev\nekomimi\dev-data\xxmi\WWMI\d3dcompiler_47.dll!
```

**Possible Root Causes**:
1. **DLL file permissions**: DLL extracted with wrong permissions (not readable by Wine)
2. **Wine/Proton incompatibility**: DLL version/architecture mismatch with game's Proton
3. **XXMI Launcher bug**: XXMI may be removing/replacing the DLL during launch, causing load failure
4. **64-bit vs 32-bit**: DLL might be wrong architecture for the game process
5. **DLL dependency**: d3dcompiler_47.dll may have missing dependencies (DX runtime, etc)

**Investigation Tasks**:
- [ ] Check DLL file size and permissions after extraction
- [ ] Run `file` command on DLL to verify PE32+ x86-64 format
- [ ] Check XXMI Launcher Log.txt for exact error before 126 (look for DLL removal messages)
- [ ] Verify that both d3d11.dll AND d3dcompiler_47.dll are present and loadable
- [ ] Try launching with Twintail to confirm it works there, then compare exact DLL usage
- [ ] Check if Twintail's XXMI has different DLL version than ours

### Caching Issue: WWMI Re-downloads Every Launch
**Problem**: `isImporterInstalled()` checks only for d3d11.dll existence. If download fails but DLL partially extracted, next launch will skip download and fail immediately.

**Solution for Next Session**:
Improve `isImporterInstalled()` in `mod-manager.ts:410-413` to be more robust:
```ts
export function isImporterInstalled(importer: string): boolean {
  const { xxmiDir } = getXXMIPaths()
  const dll = path.join(xxmiDir, importer, 'd3d11.dll')
  const compiler = path.join(xxmiDir, importer, 'd3dcompiler_47.dll')

  // Check both DLLs exist and are valid files (not broken symlinks)
  try {
    const dllStat = fs.statSync(dll)
    const compilerStat = fs.statSync(compiler)
    // Both must be regular files (or symlinks to valid files) with reasonable size
    return dllStat.isFile() && compilerStat.isFile() &&
           dllStat.size > 1000000 && compilerStat.size > 1000000
  } catch {
    return false
  }
}
```

This prevents caching broken/incomplete installations.

## Related Files
- `src/main/services/mod-manager.ts`: XXMI launch flow
- `src/main/services/game-launcher.ts`: Game launch with/without mods
- `dev-data/games/wuwa.yml`: WuWa game config
- `XXMI Launcher Config.json`: XXMI importer settings (manually edited 2026-03-08)
