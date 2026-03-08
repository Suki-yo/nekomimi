# Wuthering Waves Mod Launch Issues

## Current Status (IN PROGRESS - BLOCKED)
- **WWMI (Wuthering Waves Mod Importer)**: **Downloads but fails with error code 126** (d3dcompiler_47.dll)
- **Game Launch**: Works fine (vanilla no-mods launch works)
- **XXMI Framework**: Installed and functional for other games (EFMI, GIMI, SRMI, ZZMI)
- **Root Cause**: Unknown - d3dcompiler_47.dll permission or Wine/Proton compatibility issue

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
