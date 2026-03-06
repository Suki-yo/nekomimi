# HSR Launch Bug

## Current State
Gets to the loading screen, then crashes. Progress from earlier sessions where it crashed before loading.

## Current Config (honkai-star-rail.yml)
```yaml
env:
  STEAM_COMPAT_CONFIG: noxalia
  WINEDLLOVERRIDES: wintrust=b
runner:
  path: /home/jyq/.local/share/twintaillauncher/compatibility/runners/10.0-20260203-proton-cachyos
  prefix: /home/jyq/Games/Honkai Star Rail/prefix/pfx
  type: proton
```

## What We Know

### Crash cause
- `driverError.log` shows `initDriver Failed: Error [4,643,0]` — but ZZZ has the same error and works. Not the root cause.
- ProtonFixes skips with "unit test" warning for both HSR and ZZZ — also harmless.
- Real issue: HSR has no ProtonFix script (`gamefixes-umu/umu-honkaistarrail.py` doesn't exist).

### What ZZZ does (works)
- `GAMEID=umu-zenlesszonezero` triggers `umu-zenlesszonezero.py` ProtonFix which sets:
  - `UMU_USE_STEAM=1`
  - `WINE_DISABLE_VULKAN_OPWR=1`

### What Twintail does for HSR (manifest `compat_overrides`)
- `disable_protonfixes: true`
- `stub_wintrust: true` → `WINEDLLOVERRIDES=wintrust=b`
- `block_first_req: true` (unknown equivalent — possibly blocks AC phone-home)
- `proton_compat_config: ["noxalia"]` → `STEAM_COMPAT_CONFIG=noxalia` → Proton sets `PROTON_USE_XALIA=0` (disables Xbox Live Auth)
- `winetricks_verbs: ["vcrun2022"]` → Visual C++ 2022 must be installed in prefix

### Things tried (chronologically)
| Env vars | Result |
|---|---|
| `UMU_USE_STEAM=1` | White screen crash |
| `UMU_USE_STEAM=1` + `PROTON_USE_WINED3D=1` | White/black screen crash (worse — WineD3D breaks DX12) |
| `UMU_USE_STEAM=1` + `WINE_DISABLE_VULKAN_OPWR=1` | Instant black screen crash |
| `STEAM_COMPAT_CONFIG=noxalia` + `WINEDLLOVERRIDES=wintrust=b` | Gets to loading screen, then crashes (**current**) |

## Next Steps to Try

1. **Install vcrun2022 in the prefix** — Twintail requires it, we may not have it
   ```bash
   WINEPREFIX="/home/jyq/Games/Honkai Star Rail/prefix/pfx" \
   PROTONPATH="/home/jyq/.local/share/twintaillauncher/compatibility/runners/10.0-20260203-proton-cachyos" \
   umu-run winetricks vcrun2022
   ```

2. **Implement `block_first_req`** — Twintail sets this; unknown what it blocks exactly.
   Possibly blocking the first HoYo telemetry/AC check via `WINEDEBUG` or a hosts entry.

3. **Create a custom ProtonFix for HSR** — Create `gamefixes-umu/umu-honkaistarrail.py` in the runner dir
   mirroring what Twintail's manifest specifies, then set `GAMEID=umu-honkaistarrail`.

4. **Try GE-Proton10-32** instead of `10.0-20260203-proton-cachyos` — runner swap is low-effort.

5. **Check game.log after the loading screen crash** for more specific error.

## Key Files
- Game config: `dev-data/games/honkai-star-rail.yml`
- Runner: `/home/jyq/.local/share/twintaillauncher/compatibility/runners/10.0-20260203-proton-cachyos`
- Prefix: `/home/jyq/Games/Honkai Star Rail/prefix/pfx`
- Game log: `/home/jyq/Games/Honkai Star Rail/game.log`
- Driver error log: `/home/jyq/Games/Honkai Star Rail/driverError.log`
- Twintail HSR manifest: `/home/jyq/.local/share/twintaillauncher/manifests/TwintailTeam/game-manifests/hkrpg_global.json`
- ZZZ ProtonFix (reference): `/home/jyq/.local/share/Steam/compatibilitytools.d/GE-Proton10-30/protonfixes/gamefixes-umu/umu-zenlesszonezero.py`
