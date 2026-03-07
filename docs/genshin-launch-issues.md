# Genshin Impact Launch Issues

## Status: IN PROGRESS — MHYPBase crash at loading screen

Best state so far: game launches, shows loading screen, then MHYPBase kills it.

---

## Current Config (Twintail-aligned)

```yaml
runner:
  type: proton
  path: dev-data/runners/proton-cachyos  # 10.0-20260203-slr
  prefix: /home/jyq/Games/prefixes/genshin/pfx
launch:
  env:
    STEAM_COMPAT_CONFIG: noxalia
    GAMEID: "0"
    PROTON_LOG: "1"
    WINEDLLOVERRIDES: wintrust=b
```

GAMEID=0 disables ProtonFixes. This is intentional — see below.

---

## Key Finding: Twintail's Genshin Config

From `/home/jyq/.local/share/twintaillauncher/manifests/TwintailTeam/game-manifests/hk4e_global.json`:

```json
"compat_overrides": {
  "disable_protonfixes": true,
  "stub_wintrust": false,
  "block_first_req": false,
  "proton_compat_config": ["noxalia"]
}
```

Genshin is explicitly different from HSR:

| Setting | HSR | Genshin |
|---|---|---|
| `disable_protonfixes` | true | true |
| `stub_wintrust` | **true** | **false** |
| `block_first_req` | **true** | **false** |
| `proton_compat_config` | noxalia | noxalia |
| `winetricks_verbs` | vcrun2022 | *(none)* |
| `min_runner_versions` | *(any)* | 10.26-proton-ge, 10.0-20251222-proton-cachyos |

**Adding `GAMEID: umu-genshin` made things worse** — ProtonFixes change
something that causes `HoYoKProtect.sys` to fail fatally and crash the game
*earlier* (52 lines into the log vs 921). Twintail explicitly disables
ProtonFixes for Genshin.

---

## Crash Signatures Observed

### Run 1 — Best so far (GAMEID=0, wintrust=b;dbghelp=n,b, STUB_WINTRUST=1, BLOCK_FIRST_REQ=1)

Game reaches loading screen (red `!`), then MHYPBase kills it:

```
Exception: 0xc0000005 (EXCEPTION_ACCESS_VIOLATION)
Fault addr: MHYPBase.dll + 0x189BD81
info[0]: 0x1  (write)
info[1]: 0x1000  (kill switch target)

r8=0x88776666  (canary, same as HSR)
r12=888886666600045a  r13=8888866666000001
```

`dbghelp.dll` (= `hkrpg_patch.dll`) was loading as native — confirmed.
The HSR patch does not stop this crash for Genshin's MHYPBase.

### Run 2 — Worse (GAMEID=umu-genshin, ProtonFixes enabled)

Game crashes before the loading screen with a kernel driver failure:

```
err:module: Library WDFLDR.SYS (needed by HoYoKProtect.sys) not found
err:ntoskrnl: ZwLoadDriver failed: c0000142
fixme:ntdll:NtRaiseHardError 0x50000018
```

`HoYoKProtect.sys` is Genshin's kernel-level anticheat driver. `WDFLDR.SYS`
(Windows Driver Framework) doesn't exist in Wine. ProtonFixes for `umu-genshin`
makes the kernel driver check fatal. **Don't use GAMEID=umu-genshin.**

---

## Root Cause

Same kill switch as HSR (MHYPBase writes to 0x1000 on Wine detection), but
`hkrpg_patch.dll` is named for HSR and may only null `ntdll!wine_get_version`.
Genshin's MHYPBase appears to check additional Wine exports not covered by the
HSR patch (`wine_get_build_id`, `wine_get_host_version`, etc.).

---

## Next Steps

1. **Strip dbghelp.dll from Genshin directory** — Twintail doesn't use
   `dbghelp=n,b` for Genshin. The hkrpg_patch approach is HSR-only. Remove
   both `dbghelp.dll` from the game dir and `dbghelp=n,b` from WINEDLLOVERRIDES
   to get a clean baseline. Run again to confirm whether MHYPBase crash is the
   same or different without it.

2. **Check if proton-cachyos `-slr` variant misses Genshin patches** — Twintail
   requires `10.0-20251222-proton-cachyos` minimum. Our runner is
   `10.0-20260203-slr`. The `-slr` suffix may indicate a Star Rail-specific
   build that's missing Genshin-specific ntdll patches for hiding Wine exports.
   Try downloading the standard proton-cachyos build.

3. **Download and use Jadeite** — Jadeite patches the Genshin binary at launch
   to bypass both MHYPBase detection and the HoYoKProtect driver check.
   Directory exists at `~/.local/share/twintaillauncher/extras/jadeite/` but
   is empty (needs download). Twintail sets `jadeite: false` as default but
   the option exists. Find the Jadeite release and set it as a preLaunch
   command.

4. **Add `GetProcAddress` trace for ntdll** — Run with
   `WINEDEBUG=relay+ntdll` to capture exactly which Wine exports MHYPBase
   queries before the kill switch fires. Filter: `grep wine_get ~/steam-genshin.log`.
   (Warning: huge log.)

---

## Key Files

- Game config: `dev-data/games/genshinimpact.yml`
- Game directory: `/home/jyq/Games/Genshin Impact/`
- Twintail game manifest: `~/.local/share/twintaillauncher/manifests/TwintailTeam/game-manifests/hk4e_global.json`
- HSR patch DLL: `/usr/lib/twintaillauncher/resources/hkrpg_patch.dll`
- Jadeite dir (empty): `~/.local/share/twintaillauncher/extras/jadeite/`
- Prefix: `/home/jyq/Games/prefixes/genshin/pfx`
- Log: `~/steam-genshin.log`
