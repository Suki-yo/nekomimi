# Handoff: WuWa Standalone In Nekomimi, Twintail Deletion Deferred

Date: March 19, 2026
Repo: `/home/jyq/dev/suki-yo/nekomimi`

## Summary

- WuWa mods now inject correctly when launched from nekomimi.
- The working WuWa path is a nekomimi-owned runtime path:
  - nekomimi-owned runner
  - nekomimi-owned prefix
  - nekomimi-owned WWMI payload
  - direct Proton launch of `Client-Win64-Shipping.exe -dx11`
- Twintail does **not** need to be deleted yet.
- The immediate goal is narrower and more useful: WuWa should be able to run as a standalone nekomimi flow without relying on Twintail-owned runtime paths or launch-time sync.
- Global Twintail deletion can happen later, after standalone behavior is stable and the remaining repo cleanup is done.

## User-confirmed result

- User launched WuWa from nekomimi after the standalone WWMI patch.
- User confirmed:
  - game launched
  - WWMI injected correctly
  - mods worked

This is the acceptance signal that matters most for the migration.

## Strongest runtime evidence

### Captured Twintail working process chain

From the live working Twintail run on March 19, 2026:

- `twintaillauncher`
- `srt-bwrap`
- `pv-adverb`
- Twintail `reaper`
- Proton script:
  - `/home/jyq/.local/share/twintaillauncher/compatibility/runners/10.0-20260228-proton-cachyos/proton run z:/home/jyq/Games/WutheringWaves/Client/Binaries/Win64/Client-Win64-Shipping.exe -dx11`
- `c:\windows\system32\steam.exe ...Client-Win64-Shipping.exe -dx11`
- `Client-Win64-Shipping.exe -dx11`

Important conclusion:

- The working architecture was direct Proton launch of `Client-Win64-Shipping.exe -dx11`.
- `XXMI Launcher.exe` did not need to stay in the runtime process tree.

### Important negative finding

- The working Twintail install did not rely on persistent WWMI files dropped into the game directory.
- The working WuWa install only had `steam_appid.txt` in `Client/Binaries/Win64` before nekomimi staged its own runtime.
- The working Twintail prefix also did not replace `system32/d3d11.dll` with the WWMI DLL.

Interpretation:

- The correct model is launch-time runtime wiring around a direct client launch.
- The goal is not "keep Twintail installed forever."
- The goal is also not "delete Twintail immediately."
- The goal is "make nekomimi's WuWa path self-owned and self-sufficient first."

## What changed in code in this session

### `src/main/services/mod-manager.ts`

- WuWa on Proton no longer launches `XXMI Launcher.exe --nogui --xxmi WWMI`.
- WuWa now:
  - stages nekomimi-owned WWMI assets into the game's `Client/Binaries/Win64`
  - launches `Client-Win64-Shipping.exe -dx11` directly through Steam Runtime + Proton
  - uses Kuro-style DLL overrides:
    - `lsteamclient=d;KRSDKExternal.exe=d;jsproxy=n,b`
- Added standalone WWMI staging helpers:
  - `prepareStandaloneWwmiRuntime()`
  - `cleanupStandaloneWwmiRuntime()`
- Kept the XXMI config writer improvements that restored:
  - `game_folder = game root`
  - `game_exe_path = Client-Win64-Shipping.exe`
  - `use_launch_options = true`
  - `launch_options = ""`

### `src/main/services/game-launcher.ts`

- Added WWMI staged-runtime cleanup on session finalization.
- Added WWMI staged-runtime cleanup before vanilla WuWa launch when mods are disabled.
- Removed launch-time WuWa sync from Twintail.
- Added a standalone guard that refuses to launch WuWa if its configured runner or prefix still points at `~/.local/share/twintaillauncher`.

### `src/main/services/steamrt.ts`

- Removed Twintail Steam Runtime fallback from discovery.
- Steam Runtime discovery now prefers:
  - nekomimi-managed SteamRT
  - UMU-managed SteamRT
  - Steam's own SteamLinuxRuntime

### `src/main/services/game-detector.ts`

- Removed Twintail runner directories from Proton runner detection.

## Current standalone WuWa model

1. nekomimi owns the runner and prefix used for WuWa.
2. nekomimi owns the WWMI payload under its own XXMI storage.
3. nekomimi stages WWMI runtime symlinks into `Client/Binaries/Win64` only for the modded session.
4. nekomimi launches `Client-Win64-Shipping.exe -dx11` directly via Steam Runtime + Proton.
5. nekomimi removes staged symlinks when the session ends.

That is the standalone target. Twintail uninstall is a later cleanup decision, not the immediate milestone.

## Remaining Twintail ties after the standalone shift

These are still worth cleaning up, but they are no longer all launch blockers.

### Runtime blockers already removed

- `src/main/services/game-launcher.ts`
  - no longer syncs WuWa from Twintail on launch
- `src/main/services/steamrt.ts`
  - no longer searches Twintail-owned SteamRT
- `src/main/services/game-detector.ts`
  - no longer scans Twintail-owned runner directories

### Remaining migration/reference code

- `src/main/services/twintail-import.ts`
  - still exists as migration/import code for runner, prefix, and WWMI payload copying
- `src/main/services/download/twintail-api.ts`
  - still exists for Twintail manifest fetching
- `src/main/services/download/hoyo-api.ts`
  - still uses the Twintail manifest adapter path

### Data/config cleanup still worth doing

- Audit nekomimi-owned WuWa compat trees and remove stale copied prefixes/runners that still embed old Twintail paths in registry/config files.
- Keep only the known-good nekomimi-owned runner/prefix lineage.

### Documentation debt

- Multiple docs still describe Twintail as a live dependency or primary source of truth:
  - `docs/wuwa-mods.md`
  - `docs/install-to-launch-flow.md`
  - `docs/game-launch-guide.md`
  - `docs/SESSION.md`

## Recommended next steps

1. Treat standalone WuWa in nekomimi as the milestone.
   - Launches should succeed without reading runtime assets from `~/.local/share/twintaillauncher`.
   - Existing configs that still point at Twintail should be migrated, not silently used.

2. Audit nekomimi-owned WuWa compat data.
   - Remove stale copied prefixes/runners with embedded Twintail paths.
   - Keep the current working nekomimi-owned runner/prefix only.

3. Decide whether Twintail manifest fetching is still needed.
   - If yes, keep only the network/schema layer.
   - If no, remove `twintail-api.ts` and its callers.

4. Rewrite docs to describe nekomimi as the source of truth.

5. After steps 1-4 are stable, decide whether Twintail uninstall is worth doing.
   - Deletion is cleanup, not the prerequisite for standalone operation.

## Acceptance criteria for standalone WuWa in nekomimi

- nekomimi launches WuWa mods successfully.
- nekomimi launches WuWa vanilla successfully.
- No WuWa launch path reads required runner, prefix, SteamRT, or WWMI runtime assets from `~/.local/share/twintaillauncher`.
- If WuWa config still points at Twintail-owned runner/prefix paths, nekomimi fails clearly instead of silently depending on Twintail.
- Docs describe Twintail as historical reference or optional migration source, not as the required runtime owner.

## Files worth reopening next

- `src/main/services/mod-manager.ts`
- `src/main/services/game-launcher.ts`
- `src/main/services/twintail-import.ts`
- `src/main/services/steamrt.ts`
- `src/main/services/game-detector.ts`
- `src/main/services/download/twintail-api.ts`
- `src/main/services/download/hoyo-api.ts`
- `dev-data/games/wuwa.yml`
- `docs/wuwa-mods.md`
- `docs/install-to-launch-flow.md`

## Quick status

- nekomimi WuWa mods working: yes
- nekomimi WuWa runtime depends on Twintail at launch time: no
- nekomimi still contains Twintail migration/reference code: yes
- Twintail must be deleted right now: no
- current goal: keep WuWa standalone inside nekomimi and clean up remaining Twintail references over time: yes
