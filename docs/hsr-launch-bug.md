# HSR Launch Bug

## Status: RESOLVED ✓

## Working Solution

```yaml
runner:
  type: proton
  path: dev-data/runners/proton-cachyos  # 10.0-20260203-slr build
  prefix: /home/jyq/Games/prefixes/starrail/pfx
launch:
  env:
    STEAM_COMPAT_CONFIG: noxalia
    WINEDLLOVERRIDES: "wintrust=b;dbghelp=n,b"
    STUB_WINTRUST: "1"
    BLOCK_FIRST_REQ: "1"
```

**Plus:** copy `/usr/lib/twintaillauncher/resources/hkrpg_patch.dll` into the game
directory as `dbghelp.dll`. This DLL (installed by TwintailLauncher) patches
`ntdll!wine_get_version` → NULL, stubs wintrust, and hooks ws2_32 Connect/Send to
block the first network request.

## What Was Happening

Gets to the loading screen (red `!` in logo), then crashes. MHYPBase (anti-cheat) is
deliberately writing to address `0x1000` (a kill switch) after detecting Wine.

## Working Config

```yaml
runner:
  type: proton
  path: /home/jyq/dev/nekomimi/dev-data/runners/GE-Proton10-32
  prefix: /home/jyq/Games/prefixes/starrail/pfx
launch:
  env:
    STEAM_COMPAT_CONFIG: noxalia
    WINEDLLOVERRIDES: wintrust=b
```

## Root Cause: Wine Detection

MHYPBase detects Wine locally — **no network calls are made before the crash**
(`WINEDEBUG=+winhttp` and `WINEDEBUG=+winsock` both captured zero traffic).

The detection is via `ntdll.dll` Wine-specific exports:
- `wine_get_version`
- `wine_get_host_version`
- `wine_get_build_id`
- `wine_server_call` etc.

Any program can call `GetProcAddress(GetModuleHandle("ntdll"), "wine_get_version")` —
if non-NULL, it's Wine. MHYPBase uses this (and possibly other local checks) to detect
the environment, then deliberately sets R11=0x1000 and executes `mov [r11], rbx` to
trigger a controlled access violation.

### Crash signature (identical across all attempts)
```
MHYPBase.dll caused an Access Violation (0xc0000005)
Write to location 0000000000001000 caused an access violation.
RBX: 0x0000000088776666   R11: 0x0000000000001000  RSI: 0x65
R12: 0x8888866666000283   R13: 0x8888866666000001
Bytes at CS:EIP: 49 89 1b ...   (mov [r11], rbx)
```

This crash is **intentional** — not a bug in Wine/Proton. The `0x88776666` in RBX is
MHYPBase's own canary value; the write to `0x1000` is the kill mechanism.

## What We Know

### Env vars (Twintail manifest analysis)
| Setting | Effect | Status |
|---|---|---|
| `STEAM_COMPAT_CONFIG=noxalia` | Sets `PROTON_USE_XALIA=0` (disables Xbox Live Auth) | ✅ Applied |
| `WINEDLLOVERRIDES=wintrust=b` | Stubs wintrust.dll | ✅ Applied |
| `GAMEID=0` | Disables ProtonFixes | ✅ Via umu |
| `block_first_req` | Unknown — network-based or something else | ❌ Not implemented |
| `winetricks vcrun2022` | Visual C++ runtime | ✅ Already in GE-Proton prefix |

### Runners tried
| Runner | Result |
|---|---|
| GE-Proton10-32 | Loading screen + red `!` + crash (best so far) |
| proton-cachyos 10.0.20260227 | Black screen crash (worse) |

Note: proton-cachyos 10.0.20260227 is WORSE than GE-Proton despite being the same
family as Twintail's working runner (`10.0-20260203-proton-cachyos`). The Feb 2026
build may have had stealth patches that were removed or regressed in the Feb 27 build.

### Previous env var attempts (from earlier sessions)
| Env vars | Result |
|---|---|
| `UMU_USE_STEAM=1` | White screen crash |
| `UMU_USE_STEAM=1` + `PROTON_USE_WINED3D=1` | Black/white screen crash |
| `UMU_USE_STEAM=1` + `WINE_DISABLE_VULKAN_OPWR=1` | Instant black screen crash |
| `STEAM_COMPAT_CONFIG=noxalia` + `WINEDLLOVERRIDES=wintrust=b` | Loading screen → crash (**current best**) |

## Next Steps to Try

1. **Find and use Twintail's exact runner build** — `10.0-20260203-proton-cachyos`
   was the runner that previously got further. The newer 10.0.20260227 build is worse.
   Check if it's still available in CachyOS package archives.

2. **Hide `wine_get_version` from MHYPBase** — The ntdll export is the detection vector.
   Options:
   - A DLL shim in the prefix that intercepts `GetProcAddress` for wine-specific names
   - A Wine build with per-process export hiding (some forks support this)
   - Check if `WINE_HIDE_VERSION=1` or similar env var exists in the runner

3. **Identify `block_first_req`** — Despite no WinHTTP/Winsock traffic being captured,
   Twintail sets this. It may be blocking something at the Proton/syscall level rather
   than network level. Consider reading Twintail source if accessible.

4. **Try the old prefix** — The old Twintail prefix at
   `/home/jyq/Games/Honkai Star Rail/prefix/pfx` may have had registry patches or
   winetricks applied that the new prefix lacks. Try pointing the config at it.

5. **Module loading debug** — Run with `WINEDEBUG=+loaddll` to see exactly what happens
   in the seconds before MHYPBase triggers the kill switch.

## Key Files
- Game config: `dev-data/games/starrail.yml`
- Runner (current): `dev-data/runners/GE-Proton10-32`
- Runner (proton-cachyos, worse): `dev-data/runners/proton-cachyos`
- Prefix: `/home/jyq/Games/prefixes/starrail/pfx`
- Old Twintail prefix: `/home/jyq/Games/Honkai Star Rail/prefix/pfx`
- Crash logs: `/home/jyq/Games/prefixes/starrail/pfx/drive_c/users/steamuser/AppData/Local/Temp/Cognosphere/Star Rail/Crashes/`
- Player log: `/home/jyq/Games/prefixes/starrail/pfx/drive_c/users/steamuser/AppData/LocalLow/Cognosphere/Star Rail/Player.log`
