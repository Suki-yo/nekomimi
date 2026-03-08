# Wuthering Waves Mod Launch Issues

## Current Status (FIXED)
- **WWMI (Wuthering Waves Mod Importer)**: **3 bugs fixed** (2026-03-08)
- **Game Launch**: Works fine (vanilla no-mods launch works)
- **XXMI Framework**: Installed and functional for other games (EFMI, GIMI, SRMI, ZZMI)

## Bugs Fixed (2026-03-08)

### 1. ✅ WWMI Not Added to enabled_importers
- **Problem**: When `downloadImporter('WWMI')` succeeds, it wasn't registering in XXMI config
- **Root cause**: `enabled_importers` was only updated in `configureImporterGameFolder()`, called AFTER download
- **Fix**: Added Phase 3 to `downloadImporter()` to register importer in config immediately after successful install
- **Location**: `mod-manager.ts:329-389`

### 2. ✅ WWMI Using Wrong Injection Mode
- **Problem**: WWMI configured with `custom_launch_inject_mode: 'Hook'` but should use `'Inject'` like EFMI/GIMI
- **Root cause**: Logic at line 426 and 465 excluded WWMI from Inject mode
- **Fix**: Changed condition to include WWMI: `useInjectMode = importer === 'EFMI' || importer === 'GIMI' || importer === 'WWMI'`
- **Locations**: `mod-manager.ts:426` and `configureImporterGameFolder()` line 465-466

### 3. ✅ WWMI Not in Packages Section
- **Problem**: XXMI config had empty version info for WWMI (suggests XXMI never detected it)
- **Root cause**: WWMI wasn't in `Launcher.enabled_importers` list, so XXMI Launcher never tried to update it
- **Fixed by**: Fix #1 above — once registered in enabled_importers, XXMI will auto-check for updates

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

## Testing the Fixes

1. **Enable mods**: Set `mods.enabled: true` in `wuwa.yml`
2. **Launch WuWa with mods**: Should auto-download WWMI if missing
3. **Verify WWMI installed**: Check `dev-data/xxmi/WWMI/d3d11.dll` exists
4. **Check config**: WWMI should appear in `Launcher.enabled_importers` list in XXMI Launcher Config.json
5. **Verify injection mode**: WWMI should have `custom_launch_inject_mode: "Inject"` in config

### Debugging if Still Broken
- **Check XXMI log**: Tail `dev-data/xxmi/XXMI Launcher Log.txt` for error details
- **Manual WWMI download**: https://github.com/SpectrumQT/WWMI-Package/releases/latest
- **Verify game path**: Exe should be at `/home/jyq/Games/WutheringWaves/Client/Binaries/Win64/Client-Win64-Shipping.exe`

## Related Files
- `src/main/services/mod-manager.ts`: XXMI launch flow
- `src/main/services/game-launcher.ts`: Game launch with/without mods
- `dev-data/games/wuwa.yml`: WuWa game config
- `XXMI Launcher Config.json`: XXMI importer settings (manually edited 2026-03-08)
