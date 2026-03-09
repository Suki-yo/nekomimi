# HoYoverse Games: Install to Launch

## Common

**Launch chain (all proton games):**
```
{steamrt}/_v2-entry-point --verb=waitforexitandrun -- {runner}/proton waitforexitandrun z:\{exe}
```
steamrt search order: `dev-data/runners/steamrt` → `~/.local/share/umu/steamrt3` → `~/.local/share/twintaillauncher/compatibility/runners/steamrt` → `~/.local/share/Steam/steamapps/common/SteamLinuxRuntime_sniper`

**Do NOT use umu-run** — use pressure-vessel + proton script directly.

**Required env vars (all games):**
```
PROTONFIXES_DISABLE=1
WINEARCH=win64
STEAM_COMPAT_DATA_PATH={prefix parent}
STEAM_COMPAT_INSTALL_PATH={game dir}
STEAM_COMPAT_LIBRARY_PATHS={game dir}:{prefix}
STEAM_COMPAT_TOOL_PATHS={runner root}
STEAM_COMPAT_SHADER_PATH={prefix parent}/shadercache
```
Prefix parent must contain a `tracked_files` file (copy from a Proton-managed prefix).

---

## Genshin Impact

Config: `dev-data/games/genshinimpact.yml` | Prefix: `/home/jyq/Games/prefixes/genshin/`

```yaml
launch:
  env:
    STEAM_COMPAT_CONFIG: noxalia
    WINEDLLOVERRIDES: "lsteamclient=d;KRSDKExternal.exe=d"
```

- Do NOT install `WDFLDR.SYS` in prefix drivers — causes HoYoKProtect to crash
- Do NOT pass `-screen-fullscreen 0`

---

## Honkai: Star Rail

Config: `dev-data/games/starrail.yml` | Prefix: `/home/jyq/Games/prefixes/starrail/pfx`

```yaml
runner:
  type: proton
  path: dev-data/runners/proton-cachyos  # 10.0-20260203-slr build
launch:
  env:
    STEAM_COMPAT_CONFIG: noxalia
    WINEDLLOVERRIDES: "wintrust=b;dbghelp=n,b"
    STUB_WINTRUST: "1"
    BLOCK_FIRST_REQ: "1"
```

Copy `/usr/lib/twintaillauncher/resources/hkrpg_patch.dll` → game dir as `dbghelp.dll`.
This patches `ntdll!wine_get_version` → NULL to bypass MHYPBase Wine detection kill switch.

---

## Zenless Zone Zero

Config: `dev-data/games/zenlesszonezero.yml` | Prefix: Twintail's (reused)

```yaml
runner:
  type: proton
  path: /home/jyq/.local/share/twintaillauncher/compatibility/runners/10.0-20260207-proton-cachyos
  prefix: /home/jyq/.local/share/twintaillauncher/compatibility/prefixes/nap_global/itbzq9lkl8yvavrys1wpqw1k/pfx
launch:
  env:
    STEAM_COMPAT_CONFIG: "noxalia,gamedrive"
    WINEDLLOVERRIDES: "lsteamclient=d;KRSDKExternal.exe=d;jsproxy=n,b"
```

ZZZ adds `gamedrive` to compat config and `jsproxy=n,b` to DLL overrides vs other HoYo games.
No `STUB_WINTRUST` or `BLOCK_FIRST_REQ` needed.
