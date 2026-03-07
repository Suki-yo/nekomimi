# Game Launch Guide: Install to Mods

Full flow for getting a HoYoverse game running with mods on Linux via nekomimi.

---

## Prerequisites

- A Proton runner in `dev-data/runners/` (proton-cachyos 10.0-20260203-slr confirmed working for HSR)
- A Wine prefix created for the game
- XXMI installed (nekomimi downloads it automatically on first mod launch)

---

## 1. Install the Game

Use the GameInstallModal to download via Sophon. This handles:
- Fetching the manifest from HoYo's CDN
- Downloading and decompressing chunks in parallel
- Writing files to the game directory

`biz` values: `genshin` | `starrail` | `zzz`

---

## 2. Configure the Game YAML

After install, the game needs a YAML config at `dev-data/games/<slug>.yml`.

### Honkai: Star Rail

```yaml
name: StarRail
slug: starrail
installed: true
directory: /path/to/Honkai Star Rail
executable: /path/to/Honkai Star Rail/StarRail.exe
runner:
  type: proton
  path: dev-data/runners/proton-cachyos
  prefix: /path/to/prefixes/starrail/pfx
launch:
  env:
    STEAM_COMPAT_CONFIG: noxalia
    WINEDLLOVERRIDES: "wintrust=b;dbghelp=n,b"
    STUB_WINTRUST: "1"
    BLOCK_FIRST_REQ: "1"
mods:
  enabled: true
  importer: SRMI
```

**Required:** Copy `/usr/lib/twintaillauncher/resources/hkrpg_patch.dll` into the game
directory as `dbghelp.dll`. This DLL hides Wine's `wine_get_version` export from
MHYPBase (anti-cheat), stubs wintrust, and blocks the first network request — all
of which MHYPBase uses to detect and kill Wine processes.

Without this file, MHYPBase will write to address `0x1000` and crash the process
every time, with or without mods.

---

## 3. Enable Mods

Set `mods.enabled: true` in the YAML, or toggle it in the GameConfigModal.

When mods are enabled for a supported game, nekomimi launches via XXMI instead of
directly. XXMI injects 3DMigoto (d3d11.dll) into the game for mod loading.

The `WINEDLLOVERRIDES` are automatically merged:
- Your game config provides: `wintrust=b;dbghelp=n,b`
- XXMI adds: `d3d11=n,b;dxgi=n,b`
- Final: `wintrust=b;dbghelp=n,b;d3d11=n,b;dxgi=n,b`

All other env vars (`STUB_WINTRUST`, `BLOCK_FIRST_REQ`, `STEAM_COMPAT_CONFIG`) are
passed through to umu-run unchanged.

---

## 4. Launch

Click Launch. The flow for a mod-enabled HoYo game:

1. nekomimi calls `launchGameWithXXMI()` in `mod-manager.ts`
2. XXMI config is updated with the correct game folder path
3. `umu-run` launches `XXMI Launcher.exe --nogui --xxmi SRMI` with the merged env
4. XXMI Launcher spawns the game exe and injects d3d11.dll (Hook mode)
5. XXMI Launcher exits (auto_close = true) — this is expected
6. Game runs with mods loaded

---

## Game-to-Importer Mapping

| Executable | XXMI Importer | umu GAMEID |
|---|---|---|
| StarRail.exe | SRMI | `0` |
| GenshinImpact.exe | GIMI | `umu-genshin` |
| ZenlessZoneZero.exe | ZZMI | `umu-zenlesszonezero` |
| BH3.exe | HIMI | — |
| Client-Win64-Shipping.exe | WWMI | — |

---

## Troubleshooting

**MHYPBase crash (write to 0x1000):**
- `dbghelp.dll` is missing from the game directory, or
- `WINEDLLOVERRIDES` doesn't include `dbghelp=n,b`

**Game doesn't start at all:**
- Check runner path exists and has `files/bin/wine64`
- Check prefix path is the `pfx` directory (not its parent)

**XXMI not found:**
- nekomimi will auto-download on first mod launch
- XXMI installs to `dev-data/xxmi/`
