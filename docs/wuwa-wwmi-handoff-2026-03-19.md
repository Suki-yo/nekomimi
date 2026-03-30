# Handoff: WuWa WWMI Launch Pattern Mismatch

Date: March 19, 2026
Repo: `/home/jyq/dev/suki-yo/nekomimi`

## Summary

- nekomimi no longer fails at the old `WWMI/d3d11.dll` load step.
- nekomimi's WuWa config now syncs to Twintail's fresh runner/prefix lineage instead of staying pinned to the older copied compat state.
- The copied WWMI DLL symlinks are now normalized to nekomimi-local XXMI root DLLs instead of pointing back into Twintail's tree.
- Latest nekomimi XXMI run now passes the hook check:
  - `Successfully passed late d3d11.dll -> Client-Win64-Shipping.exe hook check!`
- Despite that, the user reports the in-game WWMI menu still is not injected / visible.
- That means the problem is no longer "XXMI cannot load the DLL" and is not well explained by simple mod-folder visibility alone.
- The remaining high-value conclusion is that nekomimi still does not match Twintail's actual launch pattern closely enough, even though the hook check now passes.

## Strongest evidence

- Fresh Twintail install, pointed at the exact same `/home/jyq/Games/WutheringWaves` install, worked with mods.
- Latest nekomimi log on March 19, 2026 still shows the same structural launch mismatch:
  - `start_exe_path=WindowsPath('Z:/home/jyq/Games/WutheringWaves/Wuthering Waves.exe')`
  - `work_dir='Z:\\home\\jyq\\Games\\WutheringWaves'`
  - `process_name='Client-Win64-Shipping.exe'`
  - `use_hook=True`
- Latest game log still shows config-monitor interference:
  - `DeviceProfiles.ini` modified
  - `42 forbidden CVars` removed
- Latest nekomimi run passed the late hook check before practical in-game WWMI behavior matched expectations.
- User-facing conclusion from the latest test:
  - game runs
  - no visible WWMI menu / mod behavior

## Latest nekomimi run worth anchoring on

Launcher log window:

- `2026-03-19 08:52:55` start
- `2026-03-19 08:52:55` XXMI updates `d3dx.ini`
- `2026-03-19 08:52:55` XXMI still updates `DeviceProfiles.ini`
- `2026-03-19 08:52:55` XXMI starts WuWa through:
  - `start_exe_path = Wuthering Waves.exe`
  - `process_name = Client-Win64-Shipping.exe`
- `2026-03-19 08:53:01` wait for process
- `2026-03-19 08:53:02` `Successfully passed late d3d11.dll -> Client-Win64-Shipping.exe hook check!`

Game log anchor points from `/home/jyq/Games/WutheringWaves/Client/Saved/Logs/Client.log`:

- `2026-03-19 08:53:03.314` `LogRHI: Using Forced RHI: D3D11`
- `2026-03-19 08:53:03.314` `LogD3D11Bridge: calling D3D11Bridge::D3D11CreateDevice`
- `2026-03-19 08:53:13.201` clean D3D11 shutdown

## What changed in code in this session

- `src/main/services/twintail-import.ts`
  - WuWa Twintail sync now discovers the live Twintail prefix under `~/.local/share/twintaillauncher/compatibility/prefixes/wuwa_global`
  - derives the runner from the prefix `config_info`
  - updates nekomimi's local copied compat state to the newer Twintail runner/prefix
- `src/main/services/mod-manager.ts`
  - WWMI launch prep now replaces stale importer DLL symlinks instead of leaving copied Twintail symlinks pointed at Twintail paths

## Important current interpretation

- A passed late hook check is not sufficient proof that nekomimi has reproduced Twintail's working launch architecture.
- The user-reported missing WWMI menu is higher value than the XXMI "hook check passed" line.
- The persistent `start_exe_path = Wuthering Waves.exe` behavior remains suspicious.
- The persistent `Updating DeviceProfiles.ini...` behavior remains suspicious.
- The next step should not be more blind WWMI config tweaking.
- The next step should be reproducing Twintail's launch pattern more exactly and proving where nekomimi still diverges.

## Recommended next debugging targets

1. Capture Twintail's actual WuWa process tree and launch chain from a known-good modded run.
2. Compare that directly against nekomimi's current chain:
   - launcher binary
   - parent process
   - `cwd`
   - executable actually started first
   - arguments
   - environment
3. Find why nekomimi/XXMI still resolves `start_exe_path` to `Wuthering Waves.exe` instead of `Client-Win64-Shipping.exe`.
4. Find why WWMI still performs `Updating DeviceProfiles.ini...` despite persisted config values intended to disable it.
5. Treat "mod menu visible in-game" as the real acceptance test, not just "late hook check passed".

## Files worth reopening

- `src/main/services/mod-manager.ts`
- `src/main/services/twintail-import.ts`
- `docs/wuwa-wwmi-3.2-handoff-2026-03-18.md`
- `docs/wuwa-mods.md`
- `/home/jyq/.local/share/nekomimi/xxmi/XXMI Launcher Log.txt`
- `/home/jyq/Games/WutheringWaves/Client/Saved/Logs/Client.log`

## Quick status

- fresh Twintail works on same game install: yes
- nekomimi copied newer Twintail runner/prefix: yes
- WWMI DLL load failure fixed: yes
- late hook check passes: yes
- in-game WWMI menu visibly injected: no
- current theory: nekomimi still diverges from Twintail launch architecture: yes
