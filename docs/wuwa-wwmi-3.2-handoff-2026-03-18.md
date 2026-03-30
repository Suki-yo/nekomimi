# Handoff: WuWa WWMI 3.2 Regression

Date: March 18, 2026
Repo: `/home/jyq/dev/suki-yo/nekomimi`

## Summary

- WWMI still fails on WuWa 3.2 under the original XXMI-owned launch flow.
- New strongest evidence from the same date: a fresh Twintail install, pointed at the exact same `/home/jyq/Games/WutheringWaves` install, successfully injected mods.
- The local duplicate-launch / immediate-relaunch bug was fixed in nekomimi:
  - WWMI Proton runs no longer do a second detached `Client-Win64-Shipping.exe` launch after starting XXMI
  - XXMI is now the sole launcher again for WWMI Proton runs
- The latest mitigation patches did apply to the live XXMI config:
  - `configure_game = false`
  - `xxmi_dll_init_delay = 500`
  - `use_launch_options = false`
  - `launch_options = ""`
- Twintail and nekomimi are using the same WWMI payload bits for the importer itself:
  - `WWMI=0.9.8`
  - matching `d3d11.dll` hash
  - matching `d3dcompiler_47.dll` hash
- Despite that, the latest XXMI run still logged `Updating DeviceProfiles.ini...`, so WWMI's runtime config mutation is still active through another control path.
- The latest local injection attempt removed nekomimi's forced `-dx11` launch option to stop XXMI from building duplicated Shell args.
- That de-duplicated the args, but it also exposed a new high-signal mismatch:
  - XXMI fell back to starting `Wuthering Waves.exe` instead of `Client-Win64-Shipping.exe`
  - hook verify still failed

## Current code state

- WWMI is still on the XXMI-owned launch path in:
  - `src/main/services/mod-manager.ts`
- The current WWMI-specific code now forces:
  - `custom_launch_enabled = false`
  - `use_launch_options = false`
  - `launch_options = ""`
  - `process_exe_names = ['Client-Win64-Shipping.exe']`
  - `configure_game = false`
  - `xxmi_dll_init_delay = 500`
- The extra detached WWMI Proton `gameLaunch` path was removed:
  - nekomimi no longer schedules a second `Client-Win64-Shipping.exe` launch after XXMI startup
- Build status:
  - `npm run build` passed after the latest patches

## Latest run captured in this session

User-facing launcher output:

```text
[mods] XXMI status: { xxmiInstalled: true, runnerInstalled: true }
[launch] Using XXMI mode for Client-Win64-Shipping.exe
[xxmi] Configured WWMI with game folder: Z:\home\jyq\Games\WutheringWaves\Client\Binaries\Win64
[xxmi] Using XXMI Launcher inject mode for WWMI
[xxmi] Launching Client-Win64-Shipping.exe with WWMI (umu=false)
[wwmi] d3dx.ini: restored XXMI launcher mode
[xxmi] WWMI Proton path: deferring game launch to XXMI to avoid duplicate spawn
[xxmi] XXMI started with PID 451019
```

Most recent bad game log:

- `/home/jyq/Games/WutheringWaves/Client/Saved/Logs/Client-backup-2026.03.18-22.40.52-2026.03.18-22.41.11.log`

Most recent XXMI run in launcher log:

- `2026-03-18 22:40:51` start
- `2026-03-18 22:40:57` wait for process
- `2026-03-18 22:40:57` verify hook
- `2026-03-18 22:41:02` hook verify failed

Relevant facts from that run:

- The double-spawn fix held:
  - no second nekomimi-side detached game launch occurred
- The `-dx11` de-duplication patch also held:
  - `MigotoManagerEvents.StartAndInject(... start_args=['-dx11'] ...)`
  - `Starting game process ... start_args=['-dx11']`
- But XXMI no longer used the client exe as the start target:
  - `start_exe_path=WindowsPath('Z:/home/jyq/Games/WutheringWaves/Wuthering Waves.exe')`
  - `exe_path=Z:\home\jyq\Games\WutheringWaves\Wuthering Waves.exe`
  - `work_dir=Z:\home\jyq\Games\WutheringWaves`
- XXMI still waited for / tried to hook the client process name:
  - `ApplicationEvents.SetupHook(... process_name='Client-Win64-Shipping.exe')`
  - `ApplicationEvents.WaitForProcess(process_name='Client-Win64-Shipping.exe')`
- XXMI still mutated config immediately before launch:
  - `ApplicationEvents.StatusUpdate(status='Updating DeviceProfiles.ini...')`
  - wrote to `X:/Games/WutheringWaves/Client/Saved/Config/WindowsNoEditor/DeviceProfiles.ini`
- XXMI still used the same WWMI console-variable block for that write:
  - `r.Kuro.SkeletalMesh.LODDistanceScaleDeviceOffset = -10`
  - `r.Streaming.Boost = 20`
  - `r.Streaming.MinBoost = 0`
  - `r.Streaming.UseAllMips = 1`
  - `r.Streaming.PoolSize = 0`
  - `r.Streaming.LimitPoolSizeToVRAM = 1`
  - `r.Streaming.UseFixedPoolSize = 1`
- The game still reached D3D11 startup:
  - `LogRHI: Using Forced RHI: D3D11`
  - `LogD3D11Bridge: calling D3D11Bridge::D3D11CreateDevice`
- The game log still shows 3.2 config monitor cleanup:
  - `DeviceProfiles.ini` hash mismatch
  - `42 forbidden CVars` removed

## Important contradiction

The live config file now says:

- file: `/home/jyq/.local/share/nekomimi/xxmi/XXMI Launcher Config.json`
- `configure_game = false`
- `xxmi_dll_init_delay = 500`
- `use_launch_options = false`
- `launch_options = ""`

But the latest XXMI run still did:

- `Updating DeviceProfiles.ini...`

That means the new config values are being persisted, but are not stopping WWMI's runtime `DeviceProfiles.ini` mutation path.

## Fixed in this session

- nekomimi's WWMI Proton path no longer double-spawns the game after XXMI startup
- XXMI no longer receives nekomimi-forced duplicated `-dx11` launch options through `launch_options`

## Strongest current conclusions

- The game binary update still lines up with the first observed failure window, but it is no longer sufficient as the working theory by itself.
- Fresh Twintail proving successful injection against the same game install is strong evidence that the remaining bug is in nekomimi's launch/runtime environment, not in the installed WuWa files alone.
- The latest config patches did not stop WWMI's DeviceProfiles mutation path.
- XXMI is still missing the hook even in runs where WuWa reaches D3D11 initialization.
- The double-spawn bug was real and is now fixed, but it was not the root cause of the hook regression.
- Removing nekomimi's explicit `launch_options = -dx11` fixed the duplicated args, but XXMI then fell back to launching `Wuthering Waves.exe`.
- The WWMI importer payload itself is not the differentiator:
  - Twintail and nekomimi have identical `WWMI` DLL hashes
  - both are on `XXMI 0.8.2` / `WWMI 0.9.8`
- The most credible remaining diffs are now:
  - Twintail's fresh runner/prefix (`10.0-20260228-proton-cachyos`) versus nekomimi's copied older runner/prefix (`10.0-20260227-proton-cachyos`)
  - nekomimi's XXMI launch orchestration and runtime environment around the importer payload
- The next high-value target is now understanding why XXMI chooses `Wuthering Waves.exe` as `start_exe_path` even though:
  - `game_folder` points at `Client/Binaries/Win64`
  - `process_exe_names = ['Client-Win64-Shipping.exe']`
  - nekomimi is not passing a second detached client launch anymore

## Recommended next debugging steps

1. Point nekomimi's WuWa config at Twintail's fresh runner and prefix directly and re-test before changing more code.
2. If that works, treat runner/prefix freshness as the primary differentiator and stop blaming the game install itself.
3. If that still fails, capture the exact nekomimi XXMI launch command/env against the known-good runner/prefix and diff it against Twintail's launch orchestration.
4. Find why the post-patch XXMI run chose `Wuthering Waves.exe` as `start_exe_path` / `exe_path` instead of `Client-Win64-Shipping.exe`.
5. Find why WWMI still performs `Updating DeviceProfiles.ini...` even with `configure_game = false`.

## Files worth reopening next

- `src/main/services/mod-manager.ts`
- `docs/wuwa-mods.md`
- `docs/wuwa-wwmi-3.2-handoff-2026-03-18.md`
- `/home/jyq/.local/share/nekomimi/xxmi/XXMI Launcher Log.txt`
- `/home/jyq/.local/share/nekomimi/xxmi/XXMI Launcher Config.json`
- `/home/jyq/Games/WutheringWaves/Client/Saved/Logs/Client-backup-2026.03.18-22.40.52-2026.03.18-22.41.11.log`

## Quick status

- Original XXMI-owned launch flow restored: yes
- Latest config patches applied to live config: yes
- Config mutation actually stopped: no
- Hook verify fixed: no
- Duplicate launch / relaunch bug present: no
- Duplicated `-dx11` args present: no
- XXMI launching `Wuthering Waves.exe` instead of client exe: yes
