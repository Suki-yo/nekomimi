# Genshin Impact Launch Issues

## Status: FIXED ✓

---

## Root Cause

Two independent issues:

1. **WDFLDR.SYS stub** — installing a stub made HoYoKProtect.sys load far enough to crash on a null WDF function table. Without any stub, the driver fails at the dependency stage and exits silently. The game tolerates this failure and continues.

2. **umu-run** — using `umu-run` set up the environment differently enough to trigger the crash. The fix was to bypass umu-run and invoke pressure-vessel + the proton script directly (matching Twintail's approach).

3. **`-screen-fullscreen 0` in launch args** — forced windowed mode, overriding the game's saved registry settings.

---

## Working Launch Chain

```
{steamrt}/_v2-entry-point --verb=waitforexitandrun -- \
  {proton}/proton waitforexitandrun \
  z:\{game.exe}
```

**Key env vars:**
```
PROTONFIXES_DISABLE=1
STEAM_COMPAT_CONFIG=noxalia
WINEDLLOVERRIDES=lsteamclient=d;KRSDKExternal.exe=d
WINEARCH=win64
STEAM_COMPAT_DATA_PATH={prefix parent}
STEAM_COMPAT_INSTALL_PATH={game dir}
STEAM_COMPAT_LIBRARY_PATHS={game dir}:{prefix}
STEAM_COMPAT_TOOL_PATHS={proton runner root}
STEAM_COMPAT_SHADER_PATH={prefix parent}/shadercache
```

**Do NOT:**
- Install `WDFLDR.SYS` in the prefix drivers dir
- Use `umu-run`
- Pass `-screen-fullscreen 0`

---

## Implementation in Nekomimi

`game-launcher.ts` auto-detects steamrt and uses this chain for all proton games. Falls back to umu-run if no steamrt found.

steamrt search order:
1. `{nekomimi runners}/steamrt` (managed, downloadable from Settings)
2. `~/.local/share/umu/steamrt3` (umu-launcher)
3. `~/.local/share/twintaillauncher/compatibility/runners/steamrt`
4. `~/.local/share/Steam/steamapps/common/SteamLinuxRuntime_sniper`

steamrt download URL (from umu-launcher source):
`https://repo.steampowered.com/steamrt3/images/latest-public-beta/SteamLinuxRuntime_3.tar.xz`

---

## Prefix Notes

- `tracked_files` must exist at the prefix parent dir (alongside `pfx/`). Copy from another Proton-managed prefix if missing.
- `shadercache/` dir is created automatically by the launcher.
- Genshin config: `dev-data/games/genshinimpact.yml`
- Prefix: `/home/jyq/Games/prefixes/genshin/`
